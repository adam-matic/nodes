#!/usr/bin/env python3
"""
Simple Web Server for Modular Math Language GUI
Serves the HTML interface with simulated execution.
"""

import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import random


class SimpleHandler(BaseHTTPRequestHandler):
    """Simple HTTP request handler with simulated execution"""

    # Shared execution state
    _execution_state = {
        'current_step': 0,
        'max_steps': 10,
        'is_running': False,
        'compiled': False
    }

    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/' or self.path == '/index.html':
            self.serve_gui()
        elif self.path == '/api/status':
            self.get_status()
        elif self.path == '/api/signals':
            self.get_signals()
        else:
            self.send_error(404, "File not found")

    def do_POST(self):
        """Handle POST requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')

        if self.path == '/api/compile':
            self.compile_code(post_data)
        elif self.path == '/api/step':
            self.step_program()
        elif self.path == '/api/reset':
            self.reset_program()
        else:
            self.send_error(404, "Endpoint not found")

    def serve_gui(self):
        """Serve the main GUI HTML file"""
        try:
            gui_path = '/storage/emulated/0/dev/examples/web_gui.html'
            with open(gui_path, 'r', encoding='utf-8') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))

        except FileNotFoundError:
            self.send_error(404, "GUI file not found")
        except Exception as e:
            self.send_error(500, f"Error serving GUI: {str(e)}")

    def compile_code(self, code_json):
        """Simulate code compilation"""
        try:
            data = json.loads(code_json)
            code = data.get('code', '')

            # Simulate compilation
            SimpleHandler._execution_state['compiled'] = True
            SimpleHandler._execution_state['current_step'] = 0

            response = {
                'success': True,
                'message': 'Program compiled successfully (simulated)',
                'max_steps': 10
            }
            self.send_json_response(response)

        except Exception as e:
            response = {
                'success': False,
                'message': f'Compilation error: {str(e)}'
            }
            self.send_json_response(response, 400)

    def step_program(self):
        """Simulate one execution step"""
        state = SimpleHandler._execution_state

        if not state['compiled']:
            response = {
                'success': False,
                'message': 'No program compiled. Please compile first.'
            }
            self.send_json_response(response, 400)
            return

        if state['current_step'] >= state['max_steps']:
            response = {
                'success': False,
                'message': 'Maximum steps reached'
            }
            self.send_json_response(response, 400)
            return

        state['current_step'] += 1

        # Simulate signal values (counter example)
        signals = {
            'const_1_out': 1.0,
            'add_1_out': float(state['current_step']),
            'mem_1_out': float(state['current_step'] - 1),
            'output_1_in': float(state['current_step'] - 1)
        }

        response = {
            'success': True,
            'message': f'Step {state["current_step"]} executed (simulated)',
            'step': state['current_step'],
            'signals': signals
        }

        self.send_json_response(response)

    def reset_program(self):
        """Reset execution state"""
        SimpleHandler._execution_state['current_step'] = 0
        SimpleHandler._execution_state['is_running'] = False

        response = {
            'success': True,
            'message': 'Execution reset',
            'step': 0
        }
        self.send_json_response(response)

    def get_status(self):
        """Get current execution status"""
        state = SimpleHandler._execution_state
        response = {
            'current_step': state['current_step'],
            'max_steps': state['max_steps'],
            'is_running': state['is_running'],
            'has_program': state['compiled']
        }
        self.send_json_response(response)

    def get_signals(self):
        """Get current signal values"""
        step = SimpleHandler._execution_state['current_step']
        signals = {
            'const_1_out': 1.0,
            'add_1_out': float(step),
            'mem_1_out': float(max(0, step - 1)),
            'output_1_in': float(max(0, step - 1))
        }
        self.send_json_response(signals)

    def send_json_response(self, data, status_code=200):
        """Send a JSON response"""
        json_data = json.dumps(data, indent=2)

        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', str(len(json_data.encode('utf-8'))))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json_data.encode('utf-8'))

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        """Minimal logging"""
        if args[1] != '200':
            super().log_message(format, *args)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Simple Modular Math GUI Server')
    parser.add_argument('--port', type=int, default=8080, help='Port to run on')

    args = parser.parse_args()

    server_address = ('', args.port)
    httpd = HTTPServer(server_address, SimpleHandler)

    print(f"Modular Math Language GUI Server starting on port {args.port}")
    print(f"Open your browser and navigate to: http://localhost:{args.port}")
    print("Press Ctrl+C to stop")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()