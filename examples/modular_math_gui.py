#!/usr/bin/env python3
"""
Modular Math Language GUI
A visual node-based editor for the modular math language using Kivy.
"""

import sys
import os
from typing import Dict, List, Optional, Tuple, Any

# Add the parent directory to the path to import the language modules
sys.path.insert(0, '/storage/emulated/0/dev/modular_math')

try:
    from kivy.app import App
    from kivy.uix.boxlayout import BoxLayout
    from kivy.uix.label import Label
    from kivy.uix.button import Button
    from kivy.uix.textinput import TextInput
    from kivy.uix.scrollview import ScrollView
    from kivy.uix.gridlayout import GridLayout
    from kivy.uix.tabbedpanel import TabbedPanel, TabbedPanelItem
    from kivy.uix.splitter import Splitter
    from kivy.uix.widget import Widget
    from kivy.graphics import Color, Rectangle, Line, Ellipse
    from kivy.uix.scatter import Scatter
    from kivy.clock import Clock
    from kivy.vector import Vector
    from kivy.uix.dropdown import DropDown
    from kivy.uix.popup import Popup
    KIVY_AVAILABLE = True
except ImportError:
    print("Kivy not available. Please install with: pip install kivy")
    KIVY_AVAILABLE = False

# Import the language modules
try:
    from tokenizer import Tokenizer
    from parser import Parser
    from ast_nodes import Program, ModuleDefinition, FunctionCall, Assignment, NumberLiteral, Identifier
    from vm import VirtualMachine
except ImportError as e:
    print(f"Error importing language modules: {e}")
    print("Make sure you're running from the correct directory")
    sys.exit(1)


class NodeWidget(Scatter):
    """Visual representation of a computation node (add, mem, const, etc.)"""

    def __init__(self, node_type: str, node_id: str, **kwargs):
        super().__init__(**kwargs)
        self.node_type = node_type
        self.node_id = node_id
        self.inputs = []  # List of input port positions
        self.outputs = []  # List of output port positions
        self.connections_in = []  # Incoming connections
        self.connections_out = []  # Outgoing connections
        self.parameters = {}  # Node parameters (e.g., const value, mem initial)

        # Node appearance based on type
        self.color_map = {
            'add': (0.2, 0.6, 0.9, 1),      # Blue
            'sub': (0.2, 0.6, 0.9, 1),      # Blue
            'mul': (0.2, 0.6, 0.9, 1),      # Blue
            'div': (0.2, 0.6, 0.9, 1),      # Blue
            'mem': (0.3, 0.8, 0.3, 1),      # Green
            'const': (0.9, 0.6, 0.2, 1),   # Orange
            'gt': (0.8, 0.3, 0.8, 1),       # Purple
            'lt': (0.8, 0.3, 0.8, 1),       # Purple
            'eq': (0.8, 0.3, 0.8, 1),       # Purple
            'output': (0.9, 0.3, 0.3, 1),  # Red
            'input': (0.3, 0.9, 0.3, 1),   # Bright green
        }

        self.size = (120, 60)
        self.setup_node()

    def setup_node(self):
        """Setup the visual appearance of the node"""
        with self.canvas:
            # Background color
            Color(*self.color_map.get(self.node_type, (0.7, 0.7, 0.7, 1)))
            self.rect = Rectangle(pos=self.pos, size=self.size)

            # Border
            Color(0.2, 0.2, 0.2, 1)
            Line(rectangle=(*self.pos, *self.size), width=2)

        # Add label
        self.label = Label(
            text=f"{self.node_type}\n{self.node_id}",
            size=self.size,
            text_size=self.size,
            halign='center',
            valign='middle'
        )
        self.add_widget(self.label)

        # Setup input/output ports based on node type
        self.setup_ports()

        self.bind(pos=self.update_graphics, size=self.update_graphics)

    def setup_ports(self):
        """Setup input and output ports based on node type"""
        port_radius = 8

        if self.node_type in ['add', 'sub', 'mul', 'div']:
            # Two inputs, one output
            self.inputs = [
                (10, self.size[1] // 2 - 10),  # Left input 1
                (10, self.size[1] // 2 + 10),  # Left input 2
            ]
            self.outputs = [(self.size[0] - 10, self.size[1] // 2)]  # Right output

        elif self.node_type == 'mem':
            # One input (signal), one output (delayed signal)
            self.inputs = [(10, self.size[1] // 2)]
            self.outputs = [(self.size[0] - 10, self.size[1] // 2)]

        elif self.node_type == 'const':
            # No inputs, one output
            self.inputs = []
            self.outputs = [(self.size[0] - 10, self.size[1] // 2)]

        elif self.node_type in ['gt', 'lt', 'eq', 'gte', 'lte']:
            # Two inputs (comparison), one output (boolean)
            self.inputs = [
                (10, self.size[1] // 2 - 10),
                (10, self.size[1] // 2 + 10),
            ]
            self.outputs = [(self.size[0] - 10, self.size[1] // 2)]

        elif self.node_type == 'output':
            # One input, no outputs
            self.inputs = [(10, self.size[1] // 2)]
            self.outputs = []

        elif self.node_type == 'input':
            # No inputs, one output
            self.inputs = []
            self.outputs = [(self.size[0] - 10, self.size[1] // 2)]

        # Draw ports
        with self.canvas:
            Color(0.1, 0.1, 0.1, 1)
            for port_pos in self.inputs + self.outputs:
                Ellipse(
                    pos=(port_pos[0] - port_radius//2, port_pos[1] - port_radius//2),
                    size=(port_radius, port_radius)
                )

    def update_graphics(self, *args):
        """Update graphics when position/size changes"""
        self.rect.pos = self.pos
        self.rect.size = self.size
        self.label.pos = self.pos
        self.label.size = self.size
        self.canvas.ask_update()

    def get_port_world_pos(self, port_index: int, is_output: bool = False) -> Tuple[float, float]:
        """Get the world position of a port"""
        ports = self.outputs if is_output else self.inputs
        if 0 <= port_index < len(ports):
            local_pos = ports[port_index]
            world_pos = self.to_parent(*local_pos)
            return world_pos
        return (0, 0)


class ConnectionWidget(Widget):
    """Visual representation of a connection between nodes"""

    def __init__(self, from_node: NodeWidget, from_port: int, to_node: NodeWidget, to_port: int, **kwargs):
        super().__init__(**kwargs)
        self.from_node = from_node
        self.from_port = from_port
        self.to_node = to_node
        self.to_port = to_port
        self.value = None  # Current signal value (for display during execution)

        # Create value label
        self.value_label = Label(
            text='',
            size_hint=(None, None),
            size=(60, 30),
            color=(0, 0, 0, 1),
            font_size=12
        )
        self.add_widget(self.value_label)

        self.draw_connection()

        # Bind to node position changes
        from_node.bind(pos=self.update_connection)
        to_node.bind(pos=self.update_connection)

    def draw_connection(self):
        """Draw the connection line"""
        with self.canvas.before:
            self.canvas.before.clear()

            # Choose color based on value
            if self.value is not None:
                # Color coding: green for positive, red for negative, blue for zero
                if self.value > 0:
                    Color(0.2, 0.8, 0.2, 0.8)
                elif self.value < 0:
                    Color(0.8, 0.2, 0.2, 0.8)
                else:
                    Color(0.2, 0.2, 0.8, 0.8)
            else:
                Color(0.3, 0.3, 0.3, 1)

            start_pos = self.from_node.get_port_world_pos(self.from_port, is_output=True)
            end_pos = self.to_node.get_port_world_pos(self.to_port, is_output=False)

            # Draw a curved line (Bezier curve for better visual appeal)
            mid_x = (start_pos[0] + end_pos[0]) / 2
            self.line = Line(
                bezier=[
                    start_pos[0], start_pos[1],
                    mid_x, start_pos[1],
                    mid_x, end_pos[1],
                    end_pos[0], end_pos[1]
                ],
                width=4 if self.value is not None else 3
            )

            # Position value label at midpoint
            mid_y = (start_pos[1] + end_pos[1]) / 2
            self.value_label.pos = (mid_x - 30, mid_y - 15)

    def update_connection(self, *args):
        """Update connection when nodes move"""
        self.draw_connection()

    def set_value(self, value: float):
        """Set the current signal value"""
        self.value = value
        if value is not None:
            self.value_label.text = f'{value:.2f}'
        else:
            self.value_label.text = ''
        self.draw_connection()


class NodeEditor(Widget):
    """The main node editor canvas"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.nodes = {}  # node_id -> NodeWidget
        self.connections = []  # List of ConnectionWidget
        self.next_node_id = 1
        self.selected_node = None
        self.dragging_connection = None

        with self.canvas.before:
            Color(0.95, 0.95, 0.95, 1)
            self.bg = Rectangle(pos=self.pos, size=self.size)

        self.bind(size=self.update_bg, pos=self.update_bg)

    def update_bg(self, *args):
        self.bg.pos = self.pos
        self.bg.size = self.size

    def add_node(self, node_type: str, pos: Tuple[float, float]) -> NodeWidget:
        """Add a new node to the editor"""
        node_id = f"{node_type}_{self.next_node_id}"
        self.next_node_id += 1

        node = NodeWidget(node_type, node_id, pos=pos)
        self.nodes[node_id] = node
        self.add_widget(node)

        return node

    def connect_nodes(self, from_node_id: str, from_port: int, to_node_id: str, to_port: int):
        """Create a connection between two nodes"""
        if from_node_id in self.nodes and to_node_id in self.nodes:
            from_node = self.nodes[from_node_id]
            to_node = self.nodes[to_node_id]

            connection = ConnectionWidget(from_node, from_port, to_node, to_port)
            self.connections.append(connection)
            self.add_widget(connection)

            # Update node connection lists
            from_node.connections_out.append(connection)
            to_node.connections_in.append(connection)

    def on_touch_down(self, touch):
        # Handle node creation on double-tap
        if touch.is_double_tap:
            self.show_node_menu(touch.pos)
            return True

        return super().on_touch_down(touch)

    def show_node_menu(self, pos):
        """Show menu to select node type"""
        dropdown = DropDown()

        node_types = ['add', 'sub', 'mul', 'div', 'mem', 'const', 'gt', 'lt', 'eq', 'input', 'output']

        for node_type in node_types:
            btn = Button(text=node_type, size_hint_y=None, height=44)
            btn.bind(on_release=lambda btn, nt=node_type: self.create_node_at_pos(nt, pos, dropdown))
            dropdown.add_widget(btn)

        # Create a temporary button to open the dropdown
        main_button = Button(text='Add Node', pos=pos, size_hint=(None, None), size=(100, 44))
        dropdown.open(main_button)

    def create_node_at_pos(self, node_type: str, pos: Tuple[float, float], dropdown):
        """Create a node at the specified position"""
        self.add_node(node_type, pos)
        dropdown.dismiss()


class CodeEditor(TextInput):
    """Text-based code editor for the modular math language"""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.multiline = True
        self.font_name = 'data/fonts/DroidSansMono.ttf'  # Monospace font
        self.background_color = (0.1, 0.1, 0.1, 1)
        self.foreground_color = (0.9, 0.9, 0.9, 1)

        # Sample code
        self.text = """module counter {
    // The counter's next value is its previous value plus one.
    next_value = add(current_value, 1)

    // The `mem` block provides the one-step delay needed for the feedback loop.
    // It starts at 0.
    current_value = mem(0, next_value)

    output current_value
}

execution {
    max_steps: 10
    save: [current_value]
}"""


class ExecutionPanel(BoxLayout):
    """Panel for execution controls and output display"""

    def __init__(self, gui_app, **kwargs):
        super().__init__(**kwargs)
        self.gui_app = gui_app  # Reference to main app
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10

        # Controls
        controls = BoxLayout(orientation='horizontal', size_hint_y=None, height=50)

        self.run_button = Button(text='Run', size_hint_x=None, width=100)
        self.run_button.bind(on_press=self.on_run)

        self.step_button = Button(text='Step', size_hint_x=None, width=100)
        self.step_button.bind(on_press=self.on_step)

        self.reset_button = Button(text='Reset', size_hint_x=None, width=100)
        self.reset_button.bind(on_press=self.on_reset)

        self.step_label = Label(text='Step: 0', size_hint_x=None, width=100)

        controls.add_widget(self.run_button)
        controls.add_widget(self.step_button)
        controls.add_widget(self.reset_button)
        controls.add_widget(self.step_label)
        controls.add_widget(Widget())  # Spacer

        # Output display
        self.output_text = TextInput(
            text='Execution output will appear here...\n',
            multiline=True,
            readonly=True,
            background_color=(0.05, 0.05, 0.05, 1),
            foreground_color=(0.9, 0.9, 0.9, 1)
        )

        self.add_widget(controls)
        self.add_widget(self.output_text)

        # VM and execution state
        self.vm = None
        self.current_program = None
        self.current_step = 0
        self.max_steps = 10
        self.is_running = False
        self.execution_timer = None

    def compile_and_setup(self):
        """Compile the current code and setup VM"""
        try:
            # Get code from the active editor
            code = self.gui_app.code_editor.text

            # Parse the code
            tokenizer = Tokenizer()
            tokens = tokenizer.tokenize(code)

            parser = Parser()
            program = parser.parse(tokens)

            # Setup VM
            self.vm = VirtualMachine()
            self.current_program = program
            self.current_step = 0

            # Extract max_steps from execution block
            if program.execution and program.execution.max_steps:
                self.max_steps = program.execution.max_steps

            self.output_text.text += f"Program compiled successfully. Max steps: {self.max_steps}\n"
            return True

        except Exception as e:
            self.output_text.text += f"Compilation error: {str(e)}\n"
            return False

    def on_run(self, button):
        """Execute the current program"""
        if self.is_running:
            # Stop execution
            self.stop_execution()
            return

        if not self.compile_and_setup():
            return

        self.output_text.text += "Running program...\n"
        self.is_running = True
        self.run_button.text = 'Stop'

        # Start execution timer
        self.execution_timer = Clock.schedule_interval(self.execute_step, 0.5)  # Execute every 0.5 seconds

    def on_step(self, button):
        """Execute one step of the program"""
        if not self.vm or not self.current_program:
            if not self.compile_and_setup():
                return

        if self.current_step >= self.max_steps:
            self.output_text.text += "Maximum steps reached\n"
            return

        try:
            # Execute one step
            result = self.vm.execute_step(self.current_program, self.current_step)
            self.current_step += 1
            self.step_label.text = f'Step: {self.current_step}'

            # Update output
            if result:
                self.output_text.text += f"Step {self.current_step}: {result}\n"

            # Update visual connections with values
            self.update_visual_values()

        except Exception as e:
            self.output_text.text += f"Execution error: {str(e)}\n"

    def execute_step(self, dt):
        """Timer callback for automatic execution"""
        if self.current_step >= self.max_steps:
            self.stop_execution()
            return False

        self.on_step(None)
        return True

    def stop_execution(self):
        """Stop automatic execution"""
        self.is_running = False
        self.run_button.text = 'Run'
        if self.execution_timer:
            self.execution_timer.cancel()
            self.execution_timer = None
        self.output_text.text += "Execution stopped\n"

    def on_reset(self, button):
        """Reset the execution state"""
        self.stop_execution()
        self.current_step = 0
        self.step_label.text = 'Step: 0'
        self.vm = None
        self.current_program = None
        self.output_text.text = "Execution reset\n"

        # Clear visual values
        if hasattr(self.gui_app, 'node_editor'):
            for connection in self.gui_app.node_editor.connections:
                connection.value = None

    def update_visual_values(self):
        """Update the visual editor with current signal values"""
        if not self.vm or not hasattr(self.gui_app, 'node_editor'):
            return

        # Get current signal values from VM
        # This would need to be implemented based on VM's signal storage
        # For now, we'll just update the connection widgets
        for connection in self.gui_app.node_editor.connections:
            # Placeholder: assign random values for demo
            import random
            connection.value = round(random.uniform(0, 10), 2)


class ModularMathGUI(App):
    """Main GUI application"""

    def build(self):
        if not KIVY_AVAILABLE:
            # Fallback for when Kivy is not available
            root = BoxLayout(orientation='vertical')
            root.add_widget(Label(text='Kivy not available. Please install Kivy to run the GUI.'))
            return root

        # Create main layout
        root = BoxLayout(orientation='horizontal')

        # Create tabbed panel for main content
        main_panel = TabbedPanel(do_default_tab=False, tab_width=150)

        # Node editor tab
        node_tab = TabbedPanelItem(text='Visual Editor')
        self.node_editor = NodeEditor()

        # Add some sample nodes for demonstration
        add_node = self.node_editor.add_node('add', (200, 300))
        mem_node = self.node_editor.add_node('mem', (400, 300))
        const_node = self.node_editor.add_node('const', (50, 350))
        output_node = self.node_editor.add_node('output', (600, 300))

        # Connect them
        self.node_editor.connect_nodes(const_node.node_id, 0, add_node.node_id, 0)
        self.node_editor.connect_nodes(add_node.node_id, 0, mem_node.node_id, 0)
        self.node_editor.connect_nodes(mem_node.node_id, 0, add_node.node_id, 1)
        self.node_editor.connect_nodes(mem_node.node_id, 0, output_node.node_id, 0)

        node_tab.add_widget(self.node_editor)
        main_panel.add_widget(node_tab)

        # Code editor tab
        code_tab = TabbedPanelItem(text='Code Editor')
        self.code_editor = CodeEditor()
        code_tab.add_widget(self.code_editor)
        main_panel.add_widget(code_tab)

        # Execution panel (right side)
        self.execution_panel = ExecutionPanel(self)

        # Create splitter
        splitter = Splitter(sizable_from='right')
        splitter.add_widget(main_panel)
        splitter.add_widget(self.execution_panel)

        root.add_widget(splitter)

        return root


if __name__ == '__main__':
    if KIVY_AVAILABLE:
        ModularMathGUI().run()
    else:
        print("Please install Kivy first: pip install kivy")
        print("Then run this script again.")