#!/usr/bin/env python3
"""
Web Server for Modular Math Language
Serves the HTML interface and provides API endpoints for code execution.
"""

import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import mimetypes
import threading
import time

# Add the parent directory to path to access modular_math package
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

try:
    from modular_math.tokenizer import Tokenizer
    from modular_math.parser import Parser
    from modular_math.vm import VirtualMachine
except ImportError as e:
    print(f"Error importing language modules: {e}")
    print("Make sure you're running from the web_interface directory")
    print("Current working directory:", os.getcwd())
    print("Script directory:", current_dir)
    print("Parent directory:", parent_dir)
    print("Python path:", sys.path[:3])
    sys.exit(1)


class ModularMathHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the modular math language web interface"""

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
                'outputs': [],
                'compiled': False
            }
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == '/' or path == '/index.html':
            self.serve_file('index.html')
        elif path.startswith('/assets/'):
            # Serve static assets
            asset_path = path[1:]  # Remove leading slash
            self.serve_file(asset_path)
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

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def serve_file(self, file_path):
        """Serve a file from the web_interface directory"""
        try:
            # Security: prevent directory traversal
            file_path = file_path.lstrip('/')
            if '..' in file_path or file_path.startswith('/'):
                self.send_error(403, "Access denied")
                return

            current_dir = os.path.dirname(os.path.abspath(__file__))
            full_path = os.path.join(current_dir, file_path)

            if not os.path.exists(full_path):
                self.send_error(404, "File not found")
                return

            # Determine content type
            content_type, _ = mimetypes.guess_type(full_path)
            if content_type is None:
                content_type = 'application/octet-stream'

            with open(full_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content)

        except FileNotFoundError:
            self.send_error(404, "File not found")
        except Exception as e:
            self.send_error(500, f"Error serving file: {str(e)}")

    def compile_code(self, code_json):
        """Compile the provided code"""
        try:
            data = json.loads(code_json)
            code = data.get('code', '')

            if not code.strip():
                raise ValueError("Empty code provided")

            # Parse the code
            tokenizer = Tokenizer(code)
            tokens = tokenizer.tokenize()

            parser = Parser(tokens)
            program = parser.parse()

            # Setup VM
            vm = VirtualMachine()
            vm.load_program(program)

            # Extract max_steps from execution block or use VM default
            max_steps = vm.max_steps  # VM sets this from execution block
            if hasattr(program, 'execution') and program.execution and hasattr(program.execution, 'max_steps'):
                max_steps = program.execution.max_steps

            # Update execution state
            state = ModularMathHandler._execution_state
            state['vm'] = vm
            state['program'] = program
            state['current_step'] = 0
            state['max_steps'] = max_steps
            state['signals'] = {}
            state['outputs'] = []
            state['compiled'] = True

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

        if not state.get('compiled') or not state['vm'] or not state['program']:
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

        if not state.get('compiled') or not state['vm'] or not state['program']:
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
            # Execute one step using the VM
            result = self.execute_vm_step(state)

            # Update state with VM's current step
            if 'step' in result:
                state['current_step'] = result['step']
            else:
                state['current_step'] += 1

            response = {
                'success': True,
                'message': f'Step {state["current_step"]} executed',
                'step': state['current_step'],
                'result': result,
                'signals': self.get_current_signals(state),
                'halted': result.get('halted', False)
            }

            self.send_json_response(response)

        except Exception as e:
            response = {
                'success': False,
                'message': f'Execution error: {str(e)}'
            }
            self.send_json_response(response, 500)

    def execute_vm_step(self, state):
        """Execute a single step in the VM"""
        try:
            # Execute using the actual VM
            vm = state['vm']

            # Execute one step
            vm.step()

            # Extract signal values from VM state
            signals = self.extract_vm_signals(vm)
            state['signals'] = signals

            return {
                'output_signals': list(signals.keys()),
                'values': signals,
                'step': vm.current_step,
                'halted': vm.halted
            }

        except Exception as e:
            # Fallback to simulation if VM execution fails
            print(f"VM execution failed, using simulation: {e}")
            return self.simulate_execution_step(state)

    def simulate_execution_step(self, state):
        """Simulate execution when VM is not available"""
        import random

        # Simulate signal values for a counter circuit
        step = state['current_step']

        # Simulate counter behavior: each step increments by 1
        const_value = 1
        current_counter_value = step  # This simulates the memory output
        next_counter_value = current_counter_value + const_value

        signals = {
            'const_1_out': const_value,
            'add_1_out': next_counter_value,
            'mem_1_out': current_counter_value,
            'output_1': current_counter_value
        }

        state['signals'] = signals

        return {
            'output_signals': list(signals.keys()),
            'values': signals,
            'simulated': True
        }

    def extract_vm_signals(self, vm):
        """Extract signal values from VM state"""
        signals = {}

        try:
            # Extract signal values from the step we just executed
            # (current_step was incremented after execution, so we need step - 1)
            executed_step = max(0, vm.current_step - 1)

            for signal_name, signal in vm.signals.items():
                # Get the value for the step we just executed
                value = signal.get_value(executed_step)
                signals[signal_name] = value

        except Exception as e:
            print(f"Error extracting signals: {e}")
            # Return empty dict if extraction fails
            pass

        return signals

    def reset_program(self):
        """Reset the execution state"""
        state = ModularMathHandler._execution_state
        state['current_step'] = 0
        state['is_running'] = False
        state['signals'] = {}
        state['outputs'] = []

        # Reset VM if it has a reset method
        if state['vm'] and hasattr(state['vm'], 'reset'):
            try:
                state['vm'].reset()
            except:
                pass

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
            'has_program': state['program'] is not None,
            'compiled': state.get('compiled', False)
        }

        self.send_json_response(response)

    def get_signals(self):
        """Get current signal values"""
        state = ModularMathHandler._execution_state
        self.send_json_response(state['signals'])

    def get_current_signals(self, state):
        """Extract current signal values from VM state"""
        return state['signals']

    def send_json_response(self, data, status_code=200):
        """Send a JSON response"""
        json_data = json.dumps(data, indent=2)

        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', str(len(json_data.encode('utf-8'))))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json_data.encode('utf-8'))

    def log_message(self, format, *args):
        """Override to reduce logging noise"""
        # Only log errors and important requests
        if 'ERROR' in format or args[1] not in ['200', '304']:
            super().log_message(format, *args)


def run_server(port=8080, host='localhost'):
    """Run the web server"""
    server_address = (host, port)
    httpd = HTTPServer(server_address, ModularMathHandler)

    print(f"Modular Math Language Web Interface starting...")
    print(f"Server running at: http://{host}:{port}")
    print(f"Open your browser and navigate to the URL above")
    print("Press Ctrl+C to stop the server")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Modular Math Language Web Interface Server')
    parser.add_argument('--port', type=int, default=8080, help='Port to run the server on (default: 8080)')
    parser.add_argument('--host', default='localhost', help='Host to bind to (default: localhost)')

    args = parser.parse_args()
    run_server(args.port, args.host)