from typing import List, Optional, Dict, Union
from tokenizer import Token, TokenType, Tokenizer
from ast_nodes import *


class ParseError(Exception):
    """Exception raised when parsing fails."""
    def __init__(self, message: str, token: Token):
        self.message = message
        self.token = token
        super().__init__(f"{message} at line {token.line}, column {token.column}")


class Parser:
    """Recursive descent parser for the modular math language."""

    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.position = 0

    def current_token(self) -> Token:
        """Get the current token."""
        if self.position >= len(self.tokens):
            return self.tokens[-1]  # Return EOF token
        return self.tokens[self.position]

    def peek_token(self, offset: int = 1) -> Token:
        """Peek at a token ahead."""
        peek_pos = self.position + offset
        if peek_pos >= len(self.tokens):
            return self.tokens[-1]  # Return EOF token
        return self.tokens[peek_pos]

    def advance(self) -> Token:
        """Move to the next token and return the previous one."""
        token = self.current_token()
        if self.position < len(self.tokens) - 1:
            self.position += 1
        return token

    def expect(self, token_type: TokenType) -> Token:
        """Consume a token of the expected type or raise an error."""
        token = self.current_token()
        if token.type != token_type:
            raise ParseError(f"Expected {token_type.value}, got {token.type.value}", token)
        return self.advance()

    def match(self, *token_types: TokenType) -> bool:
        """Check if current token matches any of the given types."""
        return self.current_token().type in token_types

    def skip_newlines(self):
        """Skip newline tokens."""
        while self.match(TokenType.NEWLINE):
            self.advance()

    def parse(self) -> Program:
        """Parse the entire program."""
        imports = []
        modules = []
        execution = None

        self.skip_newlines()

        while not self.match(TokenType.EOF):
            self.skip_newlines()

            if self.match(TokenType.IMPORT):
                imports.append(self.parse_import())
            elif self.match(TokenType.MODULE):
                modules.append(self.parse_module())
            elif self.match(TokenType.EXECUTION):
                if execution is not None:
                    raise ParseError("Multiple execution blocks not allowed", self.current_token())
                execution = self.parse_execution_block()
            else:
                # Top-level module instantiation (for single module files)
                if self.match(TokenType.IDENTIFIER) and self.peek_token().type == TokenType.LEFT_BRACE:
                    modules.append(self.parse_module())
                else:
                    raise ParseError(f"Unexpected token {self.current_token().type.value}", self.current_token())

            self.skip_newlines()

        return Program(imports=imports, modules=modules, execution=execution)

    def parse_import(self) -> ImportStatement:
        """Parse an import statement."""
        self.expect(TokenType.IMPORT)
        module_name = self.expect(TokenType.IDENTIFIER).value
        self.skip_newlines()
        return ImportStatement(module_name=module_name)

    def parse_module(self) -> ModuleDefinition:
        """Parse a module definition."""
        self.expect(TokenType.MODULE)
        name = self.expect(TokenType.IDENTIFIER).value
        self.expect(TokenType.LEFT_BRACE)
        self.skip_newlines()

        body = []
        while not self.match(TokenType.RIGHT_BRACE, TokenType.EOF):
            self.skip_newlines()
            if self.match(TokenType.RIGHT_BRACE):
                break

            stmt = self.parse_statement()
            if stmt:
                body.append(stmt)
            self.skip_newlines()

        self.expect(TokenType.RIGHT_BRACE)
        return ModuleDefinition(name=name, body=body)

    def parse_statement(self) -> Optional[Statement]:
        """Parse a statement."""
        if self.match(TokenType.INPUT):
            return self.parse_input_declaration()
        elif self.match(TokenType.PARAM):
            return self.parse_parameter_declaration()
        elif self.match(TokenType.OUTPUT):
            # Check if this is an output declaration or assignment
            next_token = self.peek_token()
            if (next_token.type in [TokenType.IDENTIFIER, TokenType.OUTPUT, TokenType.STEP_VARIABLE]) and \
               self.peek_token(2).type != TokenType.ASSIGN:
                return self.parse_output_declaration()
            else:
                # Treat as assignment (output = ...)
                return self.parse_assignment()
        elif self.match(TokenType.HALT):
            return self.parse_halt_statement()
        elif self.match(TokenType.IDENTIFIER):
            return self.parse_assignment()
        else:
            if not self.match(TokenType.NEWLINE, TokenType.EOF, TokenType.RIGHT_BRACE):
                raise ParseError(f"Unexpected token in statement: {self.current_token().type.value}", self.current_token())
            return None

    def parse_input_declaration(self) -> InputDeclaration:
        """Parse an input declaration."""
        self.expect(TokenType.INPUT)
        name = self.expect(TokenType.IDENTIFIER).value
        return InputDeclaration(name=name)

    def parse_parameter_declaration(self) -> ParameterDeclaration:
        """Parse a parameter declaration."""
        self.expect(TokenType.PARAM)
        name = self.expect(TokenType.IDENTIFIER).value

        default_value = None
        if self.match(TokenType.ASSIGN):
            self.advance()
            default_value = self.parse_expression()

        return ParameterDeclaration(name=name, default_value=default_value)

    def parse_output_declaration(self) -> OutputDeclaration:
        """Parse an output declaration."""
        self.expect(TokenType.OUTPUT)
        # Allow identifier, output keyword, or step variable as the output name
        if self.match(TokenType.IDENTIFIER, TokenType.OUTPUT, TokenType.STEP_VARIABLE):
            name = self.advance().value
        else:
            raise ParseError("Expected identifier for output name", self.current_token())
        return OutputDeclaration(name=name)

    def parse_halt_statement(self) -> HaltStatement:
        """Parse a HALT statement."""
        self.expect(TokenType.HALT)
        self.expect(TokenType.LEFT_PAREN)
        condition = self.parse_expression()
        self.expect(TokenType.RIGHT_PAREN)
        return HaltStatement(condition=condition)

    def parse_assignment(self) -> Assignment:
        """Parse an assignment statement."""
        # Allow keywords to be used as variable names in assignments
        if self.match(TokenType.IDENTIFIER, TokenType.OUTPUT, TokenType.INPUT, TokenType.PARAM):
            target = self.advance().value
        else:
            raise ParseError("Expected identifier for assignment target", self.current_token())

        self.expect(TokenType.ASSIGN)
        value = self.parse_expression()
        return Assignment(target=target, value=value)

    def parse_execution_block(self) -> ExecutionBlock:
        """Parse an execution block."""
        self.expect(TokenType.EXECUTION)
        self.expect(TokenType.LEFT_BRACE)
        self.skip_newlines()

        max_steps = None
        stop_when = None
        save = None
        plot = None

        while not self.match(TokenType.RIGHT_BRACE, TokenType.EOF):
            self.skip_newlines()
            if self.match(TokenType.RIGHT_BRACE):
                break

            if not self.match(TokenType.IDENTIFIER):
                raise ParseError("Expected identifier in execution block", self.current_token())

            key = self.advance().value
            self.expect(TokenType.COLON)

            if key == "max_steps":
                if not self.match(TokenType.NUMBER):
                    raise ParseError("Expected number for max_steps", self.current_token())
                max_steps = int(float(self.advance().value))
            elif key == "stop_when":
                stop_when = self.parse_expression()
            elif key == "save":
                save = self.parse_expression_list()
            elif key == "plot":
                plot = self.parse_expression_list()
            else:
                raise ParseError(f"Unknown execution block key: {key}", self.current_token())

            self.skip_newlines()

        self.expect(TokenType.RIGHT_BRACE)
        return ExecutionBlock(max_steps=max_steps, stop_when=stop_when, save=save, plot=plot)

    def parse_expression_list(self) -> List[Expression]:
        """Parse a list of expressions in brackets."""
        self.expect(TokenType.LEFT_BRACKET)
        expressions = []

        if not self.match(TokenType.RIGHT_BRACKET):
            expressions.append(self.parse_expression())

            while self.match(TokenType.COMMA):
                self.advance()
                expressions.append(self.parse_expression())

        self.expect(TokenType.RIGHT_BRACKET)
        return expressions

    def parse_expression(self) -> Expression:
        """Parse an expression (handles operator precedence)."""
        return self.parse_comparison()

    def parse_comparison(self) -> Expression:
        """Parse comparison expressions (==, >, <, >=, <=)."""
        expr = self.parse_arithmetic()

        while self.match(TokenType.EQUALS, TokenType.GREATER_THAN, TokenType.LESS_THAN,
                          TokenType.GREATER_EQUAL, TokenType.LESS_EQUAL):
            operator = self.advance().value
            right = self.parse_arithmetic()
            expr = BinaryOperation(left=expr, operator=operator, right=right)

        return expr

    def parse_arithmetic(self) -> Expression:
        """Parse arithmetic expressions (+ and -)."""
        expr = self.parse_term()

        while self.match(TokenType.PLUS, TokenType.MINUS):
            operator = self.advance().value
            right = self.parse_term()
            expr = BinaryOperation(left=expr, operator=operator, right=right)

        return expr

    def parse_term(self) -> Expression:
        """Parse term expressions (* and /)."""
        expr = self.parse_factor()

        while self.match(TokenType.MULTIPLY, TokenType.DIVIDE):
            operator = self.advance().value
            right = self.parse_factor()
            expr = BinaryOperation(left=expr, operator=operator, right=right)

        return expr

    def parse_factor(self) -> Expression:
        """Parse factor expressions (unary operators and primary expressions)."""
        if self.match(TokenType.MINUS):
            self.advance()
            expr = self.parse_factor()
            return BinaryOperation(left=NumberLiteral(0.0), operator="-", right=expr)
        elif self.match(TokenType.PLUS):
            self.advance()
            return self.parse_factor()
        else:
            return self.parse_postfix()

    def parse_postfix(self) -> Expression:
        """Parse postfix expressions (function calls, dot access)."""
        expr = self.parse_primary()

        while True:
            if self.match(TokenType.LEFT_PAREN):
                # Function call or module instantiation
                if isinstance(expr, Identifier):
                    # Check if it's a built-in function
                    if expr.name in ['add', 'sub', 'mul', 'mult', 'div', 'mem', 'gt', 'lt', 'eq', 'gte', 'lte']:
                        expr = self.parse_function_call(expr.name)
                    else:
                        # Module instantiation
                        expr = self.parse_module_instantiation(expr.name)
                else:
                    raise ParseError("Can only call functions or instantiate modules", self.current_token())
            elif self.match(TokenType.DOT):
                # Dot access
                self.advance()
                member = self.expect(TokenType.IDENTIFIER).value
                expr = DotAccess(object=expr, member=member)
            else:
                break

        return expr

    def parse_primary(self) -> Expression:
        """Parse primary expressions."""
        if self.match(TokenType.NUMBER):
            value = float(self.advance().value)
            return NumberLiteral(value=value)

        if self.match(TokenType.IDENTIFIER):
            name = self.advance().value
            return Identifier(name=name)

        # Allow keywords to be used as identifiers in expression context
        if self.match(TokenType.OUTPUT, TokenType.INPUT, TokenType.PARAM):
            name = self.advance().value
            return Identifier(name=name)

        if self.match(TokenType.STEP_VARIABLE):
            self.advance()
            return StepVariable()

        if self.match(TokenType.LEFT_PAREN):
            self.advance()
            expr = self.parse_expression()
            self.expect(TokenType.RIGHT_PAREN)
            return expr

        # Handle built-in functions directly
        if self.match(TokenType.ADD, TokenType.SUB, TokenType.MUL, TokenType.DIV,
                      TokenType.MEM, TokenType.GT, TokenType.LT, TokenType.EQ,
                      TokenType.GTE, TokenType.LTE):
            func_name = self.advance().value
            return self.parse_function_call(func_name)

        raise ParseError(f"Unexpected token in expression: {self.current_token().type.value}", self.current_token())

    def parse_function_call(self, function_name: str) -> FunctionCall:
        """Parse a function call."""
        self.expect(TokenType.LEFT_PAREN)
        arguments = []

        if not self.match(TokenType.RIGHT_PAREN):
            arguments.append(self.parse_expression())

            while self.match(TokenType.COMMA):
                self.advance()
                arguments.append(self.parse_expression())

        self.expect(TokenType.RIGHT_PAREN)
        return FunctionCall(name=function_name, arguments=arguments)

    def parse_module_instantiation(self, module_name: str) -> ModuleInstantiation:
        """Parse a module instantiation."""
        self.expect(TokenType.LEFT_PAREN)
        parameters = {}

        if not self.match(TokenType.RIGHT_PAREN):
            # Parse parameter assignments
            param_name = self.expect(TokenType.IDENTIFIER).value
            self.expect(TokenType.ASSIGN)
            param_value = self.parse_expression()
            parameters[param_name] = param_value

            while self.match(TokenType.COMMA):
                self.advance()
                param_name = self.expect(TokenType.IDENTIFIER).value
                self.expect(TokenType.ASSIGN)
                param_value = self.parse_expression()
                parameters[param_name] = param_value

        self.expect(TokenType.RIGHT_PAREN)
        return ModuleInstantiation(module_name=module_name, parameters=parameters)


def parse_file(filename: str) -> Program:
    """Parse a file and return the AST."""
    with open(filename, 'r') as f:
        content = f.read()

    tokenizer = Tokenizer(content)
    tokens = tokenizer.tokenize()
    parser = Parser(tokens)
    return parser.parse()


def parse_string(content: str) -> Program:
    """Parse a string and return the AST."""
    tokenizer = Tokenizer(content)
    tokens = tokenizer.tokenize()
    parser = Parser(tokens)
    return parser.parse()


if __name__ == "__main__":
    # Test with a simple example
    test_code = """
    import const

    module addition_example {
        a = const(value=10)
        b = const(value=32)
        result = add(a, b)

        output result
    }

    execution {
        max_steps: 10
        save: [result]
    }
    """

    try:
        ast = parse_string(test_code)
        from ast_nodes import ASTPrinter
        printer = ASTPrinter()
        printer.visit(ast)
    except ParseError as e:
        print(f"Parse error: {e}")