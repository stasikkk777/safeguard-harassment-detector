"""
app.py — SAFEGUARD Flask Server
Endpoints:
  GET  /              → SPA
  POST /api/send      → analyze message
  GET  /api/dashboard → full dashboard (stats + analytics + alerts + users)
  GET  /api/export    → full session JSON for download
  POST /api/import    → restore session from exported JSON
  POST /api/reset     → clear all state
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from detector import ToxicityAnalyzer
import os

app      = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)
analyzer = ToxicityAnalyzer()


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/send', methods=['POST'])
def send_message():
    data     = request.get_json(silent=True) or {}
    username = str(data.get('username', 'Anonymous')).strip()[:30]
    text     = str(data.get('message',  '')).strip()[:500]
    if not username or not text:
        return jsonify({'error': 'username and message are required'}), 400
    return jsonify(analyzer.analyze(username, text)), 200


@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    return jsonify(analyzer.get_dashboard()), 200


@app.route('/api/export', methods=['GET'])
def export_session():
    """Return the full session data as JSON (frontend will trigger download)."""
    return jsonify(analyzer.get_full_export()), 200


@app.route('/api/import', methods=['POST'])
def import_session():
    data = request.get_json(silent=True) or {}
    if 'messages' not in data:
        return jsonify({'error': 'Invalid session file — "messages" key missing'}), 400
    try:
        analyzer.import_session(data)
        count = len(data['messages'])
        return jsonify({'status': 'ok', 'loaded': count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reset', methods=['POST'])
def reset():
    analyzer.reset()
    return jsonify({'status': 'ok'}), 200


if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    print(f"  SAFEGUARD starting on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
