from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, Union, Dict, Any


class ASTNode(ABC):
    """Base class for all AST nodes."""
    pass


class Expression(ASTNode):
    """Base class for all expressions."""
    pass


class Statement(ASTNode):
    """Base class for all statements."""
    pass


@dataclass
class Identifier(Expression):
    """Represents an identifier (variable name, module name, etc.)."""
    name: str


@dataclass
class NumberLiteral(Expression):
    """Represents a numeric literal."""
    value: float


@dataclass
class StepVariable(Expression):
    """Represents the special $step variable."""
    pass


@dataclass
class BinaryOperation(Expression):
    """Represents a binary operation (arithmetic, comparison)."""
    left: Expression
    operator: str  # +, -, *, /, ==, >, <, >=, <=
    right: Expression


@dataclass
class FunctionCall(Expression):
    """Represents a function call like add(a, b) or mem(0, signal)."""
    name: str
    arguments: List[Expression]


@dataclass
class ModuleInstantiation(Expression):
    """Represents instantiation of a module with parameters."""
    module_name: str
    parameters: Dict[str, Expression]  # param_name -> value


@dataclass
class DotAccess(Expression):
    """Represents accessing a member using dot notation (instance.signal)."""
    object: Expression
    member: str


@dataclass
class Assignment(Statement):
    """Represents an assignment statement."""
    target: str
    value: Expression


@dataclass
class InputDeclaration(Statement):
    """Represents an input declaration."""
    name: str


@dataclass
class ParameterDeclaration(Statement):
    """Represents a parameter declaration with optional default value."""
    name: str
    default_value: Optional[Expression] = None


@dataclass
class OutputDeclaration(Statement):
    """Represents an output declaration."""
    name: str


@dataclass
class HaltStatement(Statement):
    """Represents a HALT statement."""
    condition: Expression


@dataclass
class ImportStatement(Statement):
    """Represents an import statement."""
    module_name: str


@dataclass
class ModuleDefinition(ASTNode):
    """Represents a complete module definition."""
    name: str
    body: List[Statement]


@dataclass
class ExecutionBlock(ASTNode):
    """Represents an execution configuration block."""
    max_steps: Optional[int] = None
    stop_when: Optional[Expression] = None
    save: Optional[List[Expression]] = None
    plot: Optional[List[Expression]] = None


@dataclass
class Program(ASTNode):
    """Represents the entire program."""
    imports: List[ImportStatement]
    modules: List[ModuleDefinition]
    execution: Optional[ExecutionBlock] = None


class ASTVisitor(ABC):
    """Base class for AST visitors."""

    @abstractmethod
    def visit(self, node: ASTNode) -> Any:
        pass

    def visit_identifier(self, node: Identifier) -> Any:
        pass

    def visit_number_literal(self, node: NumberLiteral) -> Any:
        pass

    def visit_step_variable(self, node: StepVariable) -> Any:
        pass

    def visit_binary_operation(self, node: BinaryOperation) -> Any:
        pass

    def visit_function_call(self, node: FunctionCall) -> Any:
        pass

    def visit_module_instantiation(self, node: ModuleInstantiation) -> Any:
        pass

    def visit_dot_access(self, node: DotAccess) -> Any:
        pass

    def visit_assignment(self, node: Assignment) -> Any:
        pass

    def visit_input_declaration(self, node: InputDeclaration) -> Any:
        pass

    def visit_parameter_declaration(self, node: ParameterDeclaration) -> Any:
        pass

    def visit_output_declaration(self, node: OutputDeclaration) -> Any:
        pass

    def visit_halt_statement(self, node: HaltStatement) -> Any:
        pass

    def visit_import_statement(self, node: ImportStatement) -> Any:
        pass

    def visit_module_definition(self, node: ModuleDefinition) -> Any:
        pass

    def visit_execution_block(self, node: ExecutionBlock) -> Any:
        pass

    def visit_program(self, node: Program) -> Any:
        pass


class ASTPrinter(ASTVisitor):
    """A visitor that prints the AST in a readable format."""

    def __init__(self, indent_size: int = 2):
        self.indent_size = indent_size
        self.indent_level = 0

    def _indent(self) -> str:
        return " " * (self.indent_level * self.indent_size)

    def _print_line(self, text: str):
        print(f"{self._indent()}{text}")

    def visit(self, node: ASTNode) -> Any:
        method_name = f"visit_{type(node).__name__.lower()}"
        method = getattr(self, method_name, None)
        if method:
            return method(node)
        else:
            self._print_line(f"{type(node).__name__}: {node}")

    def visit_identifier(self, node: Identifier):
        self._print_line(f"Identifier: {node.name}")

    def visit_numberliteral(self, node: NumberLiteral):
        self._print_line(f"Number: {node.value}")

    def visit_stepvariable(self, node: StepVariable):
        self._print_line("StepVariable: $step")

    def visit_binaryoperation(self, node: BinaryOperation):
        self._print_line(f"BinaryOp: {node.operator}")
        self.indent_level += 1
        self._print_line("Left:")
        self.indent_level += 1
        self.visit(node.left)
        self.indent_level -= 1
        self._print_line("Right:")
        self.indent_level += 1
        self.visit(node.right)
        self.indent_level -= 2

    def visit_functioncall(self, node: FunctionCall):
        self._print_line(f"FunctionCall: {node.name}")
        if node.arguments:
            self.indent_level += 1
            self._print_line("Arguments:")
            self.indent_level += 1
            for arg in node.arguments:
                self.visit(arg)
            self.indent_level -= 2

    def visit_moduleinstantiation(self, node: ModuleInstantiation):
        self._print_line(f"ModuleInstantiation: {node.module_name}")
        if node.parameters:
            self.indent_level += 1
            self._print_line("Parameters:")
            self.indent_level += 1
            for param_name, param_value in node.parameters.items():
                self._print_line(f"{param_name}:")
                self.indent_level += 1
                self.visit(param_value)
                self.indent_level -= 1
            self.indent_level -= 2

    def visit_dotaccess(self, node: DotAccess):
        self._print_line(f"DotAccess: .{node.member}")
        self.indent_level += 1
        self._print_line("Object:")
        self.indent_level += 1
        self.visit(node.object)
        self.indent_level -= 2

    def visit_assignment(self, node: Assignment):
        self._print_line(f"Assignment: {node.target}")
        self.indent_level += 1
        self._print_line("Value:")
        self.indent_level += 1
        self.visit(node.value)
        self.indent_level -= 2

    def visit_inputdeclaration(self, node: InputDeclaration):
        self._print_line(f"Input: {node.name}")

    def visit_parameterdeclaration(self, node: ParameterDeclaration):
        self._print_line(f"Parameter: {node.name}")
        if node.default_value:
            self.indent_level += 1
            self._print_line("Default:")
            self.indent_level += 1
            self.visit(node.default_value)
            self.indent_level -= 2

    def visit_outputdeclaration(self, node: OutputDeclaration):
        self._print_line(f"Output: {node.name}")

    def visit_haltstatement(self, node: HaltStatement):
        self._print_line("HALT")
        self.indent_level += 1
        self._print_line("Condition:")
        self.indent_level += 1
        self.visit(node.condition)
        self.indent_level -= 2

    def visit_importstatement(self, node: ImportStatement):
        self._print_line(f"Import: {node.module_name}")

    def visit_moduledefinition(self, node: ModuleDefinition):
        self._print_line(f"Module: {node.name}")
        self.indent_level += 1
        for stmt in node.body:
            self.visit(stmt)
        self.indent_level -= 1

    def visit_executionblock(self, node: ExecutionBlock):
        self._print_line("Execution Block:")
        self.indent_level += 1
        if node.max_steps is not None:
            self._print_line(f"max_steps: {node.max_steps}")
        if node.stop_when:
            self._print_line("stop_when:")
            self.indent_level += 1
            self.visit(node.stop_when)
            self.indent_level -= 1
        if node.save:
            self._print_line("save:")
            self.indent_level += 1
            for expr in node.save:
                self.visit(expr)
            self.indent_level -= 1
        if node.plot:
            self._print_line("plot:")
            self.indent_level += 1
            for expr in node.plot:
                self.visit(expr)
            self.indent_level -= 1
        self.indent_level -= 1

    def visit_program(self, node: Program):
        self._print_line("Program:")
        self.indent_level += 1

        if node.imports:
            self._print_line("Imports:")
            self.indent_level += 1
            for imp in node.imports:
                self.visit(imp)
            self.indent_level -= 1

        if node.modules:
            self._print_line("Modules:")
            self.indent_level += 1
            for module in node.modules:
                self.visit(module)
            self.indent_level -= 1

        if node.execution:
            self.visit(node.execution)

        self.indent_level -= 1