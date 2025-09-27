#!/usr/bin/env python3
"""
Web Server for Modular Math Language GUI
Serves the HTML interface and provides API endpoints for code execution.
"""

import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import time

# Add the parent directory to the path to import the language modules
sys.path.insert(0, '/storage/emulated/0/dev/modular_math')

try:
    import tokenizer
    import parser as lang_parser
    import vm
    Tokenizer = tokenizer.Tokenizer
    Parser = lang_parser.Parser
    VirtualMachine = vm.VirtualMachine
except ImportError as e:
    print(f"Error importing language modules: {e}")
    print("Make sure you're running from the correct directory")
    sys.exit(1)


class ModularMathHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the modular math language GUI"""

    def __init__(self, *args, **kwargs):
        # Initialize shared execution state
        if not hasattr(ModularMathHandler, '_execution_state'):
            ModularMathHandler._execution_state = {
                'vm': None,
                'program': None,
                'current_step': 0,
                'max_steps': 10,
                'is_running': False,
                'signals': {},
                'outputs': []
            }
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == '/' or path == '/index.html':
            self.serve_gui()
        elif path == '/api/status':
            self.get_status()
        elif path == '/api/signals':
            self.get_signals()
        else:
            self.send_error(404, "File not found")

    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')

        if path == '/api/compile':
            self.compile_code(post_data)
        elif path == '/api/run':
            self.run_program()
        elif path == '/api/step':
            self.step_program()
        elif path == '/api/reset':
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
        """Compile the provided code"""
        try:
            data = json.loads(code_json)
            code = data.get('code', '')

            # Parse the code
            tokenizer = Tokenizer()
            tokens = tokenizer.tokenize(code)

            parser = Parser()
            program = parser.parse(tokens)

            # Setup VM
            vm = VirtualMachine()

            # Extract max_steps from execution block
            max_steps = 10
            if program.execution and program.execution.max_steps:
                max_steps = program.execution.max_steps

            # Update execution state
            state = ModularMathHandler._execution_state
            state['vm'] = vm
            state['program'] = program
            state['current_step'] = 0
            state['max_steps'] = max_steps
            state['signals'] = {}
            state['outputs'] = []

            response = {
                'success': True,
                'message': f'Program compiled successfully. Max steps: {max_steps}',
                'max_steps': max_steps
            }

            self.send_json_response(response)

        except Exception as e:
            response = {
                'success': False,
                'message': f'Compilation error: {str(e)}'
            }
            self.send_json_response(response, 400)

    def run_program(self):
        """Start automatic execution"""
        state = ModularMathHandler._execution_state

        if not state['vm'] or not state['program']:
            response = {
                'success': False,
                'message': 'No program compiled. Please compile first.'
            }
            self.send_json_response(response, 400)
            return

        state['is_running'] = True
        response = {
            'success': True,
            'message': 'Program execution started',
            'running': True
        }
        self.send_json_response(response)

    def step_program(self):
        """Execute one step of the program"""
        state = ModularMathHandler._execution_state

        if not state['vm'] or not state['program']:
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

        try:
            # Execute one step
            # Note: This is a simplified version. The actual VM interface may differ.
            result = self.execute_vm_step(state)
            state['current_step'] += 1

            response = {
                'success': True,
                'message': f'Step {state["current_step"]} executed',
                'step': state['current_step'],
                'result': result,
                'signals': self.get_current_signals(state)
            }

            self.send_json_response(response)

        except Exception as e:
            response = {
                'success': False,
                'message': f'Execution error: {str(e)}'
            }
            self.send_json_response(response, 500)

    def execute_vm_step(self, state):
        """Execute a single step in the VM (simplified)"""
        # This is a placeholder implementation
        # The actual implementation would depend on the VM's interface

        # For now, simulate execution with dummy values
        import random

        # Simulate signal values
        signals = {}
        for i, conn_id in enumerate(['const_1_out', 'add_1_out', 'mem_1_out']):
            signals[conn_id] = round(random.uniform(0, 10) + state['current_step'], 2)

        state['signals'] = signals

        return {
            'output_signals': list(signals.keys()),
            'values': signals
        }

    def reset_program(self):
        """Reset the execution state"""
        state = ModularMathHandler._execution_state
        state['current_step'] = 0
        state['is_running'] = False
        state['signals'] = {}
        state['outputs'] = []

        response = {
            'success': True,
            'message': 'Execution reset',
            'step': 0
        }
        self.send_json_response(response)

    def get_status(self):
        """Get current execution status"""
        state = ModularMathHandler._execution_state

        response = {
            'current_step': state['current_step'],
            'max_steps': state['max_steps'],
            'is_running': state['is_running'],
            'has_program': state['program'] is not None
        }

        self.send_json_response(response)

    def get_signals(self):
        """Get current signal values"""
        state = ModularMathHandler._execution_state
        self.send_json_response(state['signals'])

    def get_current_signals(self, state):
        """Extract current signal values from VM state"""
        # This would extract actual signal values from the VM
        # For now, return the simulated signals
        return state['signals']

    def send_json_response(self, data, status_code=200):
        """Send a JSON response"""
        json_data = json.dumps(data, indent=2)

        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', str(len(json_data.encode('utf-8'))))
        self.send_header('Access-Control-Allow-Origin', '*')  # Allow CORS
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
        """Override to reduce logging noise"""
        # Only log errors
        if 'ERROR' in format or args[1] != '200':
            super().log_message(format, *args)


def run_server(port=8080):
    """Run the web server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, ModularMathHandler)

    print(f"Modular Math Language GUI Server starting on port {port}")
    print(f"Open your browser and navigate to: http://localhost:{port}")
    print("Press Ctrl+C to stop the server")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Modular Math Language Web GUI Server')
    parser.add_argument('--port', type=int, default=8080, help='Port to run the server on (default: 8080)')

    args = parser.parse_args()
    run_server(args.port)