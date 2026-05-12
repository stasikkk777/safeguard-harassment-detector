"""
detector.py — SAFEGUARD Core Analysis Engine
=============================================================
Primary scorer : Detoxify  (transformer-based ML)
DSA structures :
  1. Trie              — O(m) keyword extraction / annotation
  2. Priority Queue    — max-heap alert management
  3. Deque Queue       — FIFO bounded message pipeline
  4. Hash Map          — O(1) user profile lookup
  5. Sliding Window    — 120 s rolling behavioural analysis
  6. Word-Freq HashMap — O(1) increment, top-N toxic word ranking
"""

import re, time, heapq
from collections import deque


# =============================================================================
# 1. TRIE  —  O(m) keyword matching
# =============================================================================

class TrieNode:
    __slots__ = ('children', 'is_end', 'severity', 'category')
    def __init__(self):
        self.children: dict = {}
        self.is_end:   bool = False
        self.severity: int  = 0
        self.category: str  = ''

class Trie:
    def __init__(self):
        self.root   = TrieNode()
        self._count = 0

    def insert(self, phrase: str, severity: int, category: str) -> None:
        node = self.root
        for ch in phrase.lower():
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        if not node.is_end:
            self._count += 1
        node.is_end = True; node.severity = severity; node.category = category

    def search(self, phrase: str) -> dict | None:
        node = self.root
        for ch in phrase.lower():
            if ch not in node.children:
                return None
            node = node.children[ch]
        return {'severity': node.severity, 'category': node.category} if node.is_end else None

    def scan_text(self, text: str) -> list[dict]:
        tokens    = re.findall(r"\b\w+\b", text.lower())
        candidates: set[str] = set(tokens)
        for i, t in enumerate(tokens):
            if i + 1 < len(tokens): candidates.add(f"{t} {tokens[i+1]}")
            if i + 2 < len(tokens): candidates.add(f"{t} {tokens[i+1]} {tokens[i+2]}")
        hits = [{'word': c, **r} for c in candidates if (r := self.search(c))]
        return sorted(hits, key=lambda x: -x['severity'])

    @property
    def size(self) -> int:
        return self._count


# =============================================================================
# 2. PRIORITY QUEUE  —  max-heap alert management
# =============================================================================

class Alert:
    __slots__ = ('user', 'message', 'severity', 'ts')
    def __init__(self, user, message, severity, ts):
        self.user = user; self.message = message
        self.severity = severity; self.ts = ts

    def __lt__(self, other):
        return self.severity > other.severity   # invert → max-heap

    def to_dict(self) -> dict:
        return {
            'user':      self.user,
            'message':   self.message[:60] + ('…' if len(self.message) > 60 else ''),
            'severity':  round(self.severity, 1),
            'timestamp': time.strftime('%H:%M:%S', time.localtime(self.ts)),
        }

class AlertPriorityQueue:
    MAX_SIZE = 50
    def __init__(self): self._heap: list[Alert] = []

    def push(self, alert: Alert) -> None:
        heapq.heappush(self._heap, alert)
        if len(self._heap) > self.MAX_SIZE:
            worst = min(self._heap, key=lambda a: a.severity)
            self._heap.remove(worst)
            heapq.heapify(self._heap)

    def get_top(self, n: int = 15) -> list[Alert]:
        return sorted(self._heap, key=lambda a: -a.severity)[:n]

    def __len__(self): return len(self._heap)


# =============================================================================
# 3. MESSAGE QUEUE  —  FIFO circular buffer
# =============================================================================

class MessageQueue:
    def __init__(self, maxlen: int = 500):
        self._q: deque = deque(maxlen=maxlen)

    def enqueue(self, msg: dict) -> None: self._q.append(msg)
    def get_all(self) -> list:           return list(self._q)
    def get_recent(self, n: int = 40)-> list: return list(self._q)[-n:]
    def __len__(self): return len(self._q)


# =============================================================================
# 4 + 5.  SLIDING WINDOW  +  HASH MAP  —  user risk tracker
# =============================================================================

class SlidingWindow:
    def __init__(self, window_sec: int = 120):
        self.window_sec = window_sec
        self._events: deque = deque()

    def record(self, score: float) -> None:
        now = time.time()
        self._events.append((now, score))
        while self._events and self._events[0][0] < now - self.window_sec:
            self._events.popleft()

    def mean_score(self) -> float:
        return sum(s for _, s in self._events) / len(self._events) if self._events else 0.0

    def flagged_count(self) -> int:
        return sum(1 for _, s in self._events if s >= 20)


class UserRiskTracker:
    THRESHOLDS = [('critical', 65, 3), ('high', 45, 2), ('medium', 20, 1)]

    def __init__(self): self._map: dict = {}

    def _init(self, username: str) -> dict:
        return {
            'username':         username,
            'total_messages':   0,
            'flagged_messages': 0,
            'warnings':         0,
            'risk_level':       'safe',
            'window':           SlidingWindow(),
            'all_scores':       [],          # kept for avg_toxicity across session
            'joined':           time.strftime('%H:%M:%S'),
        }

    def record(self, username: str, score: float, is_flagged: bool) -> dict:
        if username not in self._map:
            self._map[username] = self._init(username)
        u = self._map[username]
        u['total_messages'] += 1
        u['all_scores'].append(score)
        u['window'].record(score)
        if is_flagged:
            u['flagged_messages'] += 1
            u['warnings']         += 1
        avg = u['window'].mean_score()
        fc  = u['window'].flagged_count()
        u['risk_level'] = 'safe'
        for level, ma, mf in self.THRESHOLDS:
            if avg >= ma or fc >= mf:
                u['risk_level'] = level; break
        return self._export(u)

    def _export(self, u: dict) -> dict:
        scores = u['all_scores']
        return {
            'username':          u['username'],
            'total_messages':    u['total_messages'],
            'flagged_messages':  u['flagged_messages'],
            'warnings':          u['warnings'],
            'risk_level':        u['risk_level'],
            'window_score':      round(u['window'].mean_score(), 1),
            'avg_toxicity':      round(sum(scores) / len(scores), 1) if scores else 0.0,
            'flagged_in_window': u['window'].flagged_count(),
            'joined':            u['joined'],
        }

    def all_profiles(self) -> list[dict]:
        return [self._export(u) for u in self._map.values()]


# =============================================================================
# 6. WORD-FREQUENCY HASH MAP  —  O(1) increment, O(n log n) top-N retrieval
# =============================================================================

class WordFrequencyTracker:
    """
    Hash Map: toxic_word (str) → occurrence_count (int).
    Tracks which keywords from the Trie are seen most often across all messages.
    """
    def __init__(self): self._map: dict[str, int] = {}

    def record(self, keywords: list[dict]) -> None:
        for kw in keywords:
            word = kw['word']
            self._map[word] = self._map.get(word, 0) + 1    # O(1) amortised

    def top_n(self, n: int = 10) -> list[dict]:
        return [
            {'word': w, 'count': c}
            for w, c in sorted(self._map.items(), key=lambda x: -x[1])[:n]
        ]

    def clear(self) -> None: self._map.clear()


# =============================================================================
# KEYWORD DATABASE
# =============================================================================

KEYWORD_DB: dict[str, tuple[int, str]] = {
    'stupid':           (1, 'mild_insult'),   'dumb':        (1, 'mild_insult'),
    'idiot':            (1, 'mild_insult'),   'loser':       (1, 'mild_insult'),
    'ugly':             (1, 'mild_insult'),   'freak':       (1, 'mild_insult'),
    'lame':             (1, 'mild_insult'),   'weirdo':      (1, 'mild_insult'),
    'hate you':         (2, 'harassment'),    'pathetic':    (2, 'harassment'),
    'worthless':        (2, 'harassment'),    'disgusting':  (2, 'harassment'),
    'go away':          (2, 'harassment'),    'shut up':     (2, 'harassment'),
    'moron':            (2, 'harassment'),    'trash':       (2, 'harassment'),
    'garbage':          (2, 'harassment'),
    'nobody likes you': (3, 'severe'),        'no one likes you': (3, 'severe'),
    'you are nothing':  (3, 'severe'),        'die':         (3, 'severe_threat'),
    'go die':           (3, 'severe_threat'), 'destroy you': (3, 'severe_threat'),
    'hurt you':         (3, 'severe_threat'), 'make you pay':(3, 'severe_threat'),
    'kill yourself':    (4, 'explicit_threat'), 'kys':       (4, 'explicit_threat'),
    'i will find you':  (4, 'explicit_threat'), 'end you':   (4, 'explicit_threat'),
}

SCORE_META = [
    ('toxicity',        'TOXICITY',   'Overall harmful intent'),
    ('severe_toxicity', 'SEVERE',     'Very strong/hateful language'),
    ('obscene',         'OBSCENE',    'Crude/explicit language'),
    ('threat',          'THREAT',     'Direct threats of harm'),
    ('insult',          'INSULT',     'Personal attacks'),
    ('identity_attack', 'IDENTITY',   'Identity-based attacks'),
]


# =============================================================================
# MAIN ENGINE
# =============================================================================

class ToxicityAnalyzer:

    def __init__(self):
        self.trie      = Trie()
        self.messages  = MessageQueue(maxlen=500)
        self.alerts    = AlertPriorityQueue()
        self.users     = UserRiskTracker()
        self.word_freq = WordFrequencyTracker()
        self._start_ts = time.strftime('%H:%M:%S')

        for phrase, (sev, cat) in KEYWORD_DB.items():
            self.trie.insert(phrase, sev, cat)

        print("  [SAFEGUARD] Loading Detoxify 'original' model…")
        from detoxify import Detoxify
        self._model = Detoxify('original')
        self._model.predict("warm up")
        print("  [SAFEGUARD] Model ready.")

    # ------------------------------------------------------------------
    def analyze(self, username: str, text: str) -> dict:
        raw    = self._model.predict(text)
        scores = {k: round(float(v) * 100, 1) for k, v in raw.items()}
        overall = round(max(scores.values()), 1)

        if   overall >= 75: severity = 'critical'
        elif overall >= 50: severity = 'high'
        elif overall >= 20: severity = 'medium'
        else:               severity = 'safe'

        is_flagged = overall >= 20
        keywords   = self.trie.scan_text(text)

        msg = {
            'id':             int(time.time() * 1000),
            'username':       username,
            'text':           text,
            'toxicity_score': overall,
            'severity':       severity,
            'is_flagged':     is_flagged,
            'scores':         scores,
            'keywords':       keywords,
            'timestamp':      time.strftime('%H:%M:%S'),
        }

        self.messages.enqueue(msg)
        self.word_freq.record(keywords)
        user_stats = self.users.record(username, overall, is_flagged)

        if is_flagged:
            self.alerts.push(Alert(username, text, overall, time.time()))

        return {'message': msg, 'user': user_stats, 'global': self._global_stats()}

    # ------------------------------------------------------------------
    def import_session(self, data: dict) -> None:
        """Restore a previously exported session (no re-analysis needed)."""
        self.reset()
        for msg in data.get('messages', []):
            # Normalise fields that might be missing in older exports
            score = msg.get('toxicity_score', 0)
            if 'severity' not in msg:
                if score >= 75: msg['severity'] = 'critical'
                elif score >= 50: msg['severity'] = 'high'
                elif score >= 20: msg['severity'] = 'medium'
                else:            msg['severity'] = 'safe'
            if 'is_flagged' not in msg:
                msg['is_flagged'] = score >= 20
            if 'scores' not in msg:
                msg['scores'] = {}
            if 'keywords' not in msg:
                msg['keywords'] = []

            self.messages.enqueue(msg)
            self.word_freq.record(msg['keywords'])
            self.users.record(msg['username'], score, msg['is_flagged'])

            if msg['is_flagged']:
                self.alerts.push(Alert(msg['username'], msg['text'], score, time.time()))

    # ------------------------------------------------------------------
    def _global_stats(self) -> dict:
        all_msgs = self.messages.get_all()
        flagged  = [m for m in all_msgs if m['is_flagged']]
        avg      = sum(m['toxicity_score'] for m in all_msgs) / max(len(all_msgs), 1)
        return {
            'total_messages':   len(all_msgs),
            'flagged_messages': len(flagged),
            'flag_rate':        round(len(flagged) / max(len(all_msgs), 1) * 100, 1),
            'avg_toxicity':     round(avg, 1),
            'alert_count':      len(self.alerts),
            'active_users':     len(self.users.all_profiles()),
            'trie_keywords':    self.trie.size,
        }

    def _analytics(self) -> dict:
        all_msgs = self.messages.get_all()
        sev_dist = {'safe': 0, 'medium': 0, 'high': 0, 'critical': 0}
        for m in all_msgs:
            sev_dist[m['severity']] = sev_dist.get(m['severity'], 0) + 1
        profiles = self.users.all_profiles()
        top_users = sorted(profiles, key=lambda u: -u['avg_toxicity'])[:5]
        return {
            'severity_distribution': sev_dist,
            'timeline': [{'score': m['toxicity_score'], 'user': m['username']}
                         for m in all_msgs[-30:]],
            'top_users': top_users,
            'top_words': self.word_freq.top_n(10),
        }

    def get_dashboard(self) -> dict:
        return {
            'stats':     self._global_stats(),
            'users':     self.users.all_profiles(),
            'alerts':    [a.to_dict() for a in self.alerts.get_top(15)],
            'messages':  self.messages.get_recent(40),
            'analytics': self._analytics(),
            'start_ts':  self._start_ts,
        }

    def get_full_export(self) -> dict:
        """Everything needed to reconstruct this session."""
        return {
            'exported_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'session_stats': self._global_stats(),
            'messages':      self.messages.get_all(),
            'users':         self.users.all_profiles(),
            'alerts':        [a.to_dict() for a in self.alerts.get_top(50)],
            'top_words':     self.word_freq.top_n(20),
        }

    def reset(self) -> None:
        self.messages  = MessageQueue(maxlen=500)
        self.alerts    = AlertPriorityQueue()
        self.users     = UserRiskTracker()
        self.word_freq = WordFrequencyTracker()
        self._start_ts = time.strftime('%H:%M:%S')
