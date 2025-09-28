from enum import Enum
from dataclasses import dataclass
from typing import List, Optional
import re


class TokenType(Enum):
    # Keywords
    MODULE = "MODULE"
    INPUT = "INPUT"
    PARAM = "PARAM"
    OUTPUT = "OUTPUT"
    EXECUTION = "EXECUTION"
    IMPORT = "IMPORT"
    FROM = "FROM"
    HALT = "HALT"

    # Identifiers and literals
    IDENTIFIER = "IDENTIFIER"
    NUMBER = "NUMBER"
    STRING = "STRING"

    # Operators
    PLUS = "PLUS"
    MINUS = "MINUS"
    MULTIPLY = "MULTIPLY"
    DIVIDE = "DIVIDE"
    ASSIGN = "ASSIGN"
    EQUALS = "EQUALS"
    GREATER_THAN = "GREATER_THAN"
    LESS_THAN = "LESS_THAN"
    GREATER_EQUAL = "GREATER_EQUAL"
    LESS_EQUAL = "LESS_EQUAL"

    # Delimiters
    LEFT_BRACE = "LEFT_BRACE"
    RIGHT_BRACE = "RIGHT_BRACE"
    LEFT_PAREN = "LEFT_PAREN"
    RIGHT_PAREN = "RIGHT_PAREN"
    LEFT_BRACKET = "LEFT_BRACKET"
    RIGHT_BRACKET = "RIGHT_BRACKET"
    COMMA = "COMMA"
    COLON = "COLON"
    DOT = "DOT"

    # Special
    STEP_VARIABLE = "STEP_VARIABLE"  # $step
    NEWLINE = "NEWLINE"
    EOF = "EOF"

    # Built-in functions
    ADD = "ADD"
    SUB = "SUB"
    MUL = "MUL"
    DIV = "DIV"
    MEM = "MEM"
    GT = "GT"
    LT = "LT"
    EQ = "EQ"
    GTE = "GTE"
    LTE = "LTE"


@dataclass
class Token:
    type: TokenType
    value: str
    line: int
    column: int


class Tokenizer:
    def __init__(self, text: str):
        self.text = text
        self.position = 0
        self.line = 1
        self.column = 1
        self.tokens = []

        # Keywords mapping
        self.keywords = {
            'module': TokenType.MODULE,
            'input': TokenType.INPUT,
            'param': TokenType.PARAM,
            'output': TokenType.OUTPUT,
            'execution': TokenType.EXECUTION,
            'import': TokenType.IMPORT,
            'from': TokenType.FROM,
            'HALT': TokenType.HALT,
            'add': TokenType.ADD,
            'sub': TokenType.SUB,
            'mul': TokenType.MUL,
            'mult': TokenType.MUL,  # Alternative name used in examples
            'div': TokenType.DIV,
            'mem': TokenType.MEM,
            'gt': TokenType.GT,
            'lt': TokenType.LT,
            'eq': TokenType.EQ,
            'gte': TokenType.GTE,
            'lte': TokenType.LTE,
        }

    def current_char(self) -> Optional[str]:
        if self.position >= len(self.text):
            return None
        return self.text[self.position]

    def peek_char(self, offset: int = 1) -> Optional[str]:
        peek_pos = self.position + offset
        if peek_pos >= len(self.text):
            return None
        return self.text[peek_pos]

    def advance(self):
        if self.position < len(self.text) and self.text[self.position] == '\n':
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        self.position += 1

    def skip_whitespace(self):
        while self.current_char() and self.current_char() in ' \t\r':
            self.advance()

    def skip_comment(self):
        # Skip // comments
        if self.current_char() == '/' and self.peek_char() == '/':
            while self.current_char() and self.current_char() != '\n':
                self.advance()

    def read_number(self) -> Token:
        start_line, start_column = self.line, self.column
        value = ""

        while self.current_char() and (self.current_char().isdigit() or self.current_char() == '.'):
            value += self.current_char()
            self.advance()

        return Token(TokenType.NUMBER, value, start_line, start_column)

    def read_identifier(self) -> Token:
        start_line, start_column = self.line, self.column
        value = ""

        while self.current_char() and (self.current_char().isalnum() or self.current_char() == '_'):
            value += self.current_char()
            self.advance()

        # Check if it's a keyword
        token_type = self.keywords.get(value, TokenType.IDENTIFIER)
        return Token(token_type, value, start_line, start_column)

    def read_step_variable(self) -> Token:
        start_line, start_column = self.line, self.column
        value = ""

        # Read $step
        if self.current_char() == '$':
            value += self.current_char()
            self.advance()

            while self.current_char() and self.current_char().isalpha():
                value += self.current_char()
                self.advance()

        return Token(TokenType.STEP_VARIABLE, value, start_line, start_column)

    def read_string(self) -> Token:
        """Read a string literal."""
        start_line, start_column = self.line, self.column
        value = ""

        # Skip opening quote
        self.advance()

        while self.current_char() and self.current_char() != '"':
            if self.current_char() == '\\':
                # Handle escape sequences
                self.advance()
                if self.current_char() == 'n':
                    value += '\n'
                elif self.current_char() == 't':
                    value += '\t'
                elif self.current_char() == '\\':
                    value += '\\'
                elif self.current_char() == '"':
                    value += '"'
                else:
                    value += self.current_char()
            else:
                value += self.current_char()
            self.advance()

        if not self.current_char():
            raise SyntaxError(f"Unterminated string starting on line {start_line}")

        # Skip closing quote
        self.advance()

        return Token(TokenType.STRING, value, start_line, start_column)

    def tokenize(self) -> List[Token]:
        while self.current_char():
            self.skip_whitespace()

            if not self.current_char():
                break

            char = self.current_char()
            line, column = self.line, self.column

            # Handle comments
            if char == '/' and self.peek_char() == '/': # Single-line comment
                while self.current_char() and self.current_char() != '\n':
                    self.advance()
                continue
            elif char == '/' and self.peek_char() == '*': # Multi-line comment
                self.advance() # consume '/'
                self.advance() # consume '*'
                start_line = self.line
                while self.current_char():
                    if self.current_char() == '*' and self.peek_char() == '/':
                        self.advance() # consume '*'
                        self.advance() # consume '/'
                        break
                    self.advance()
                else:
                    raise SyntaxError(f"Unterminated multi-line comment starting on line {start_line}")
                continue

            # Handle newlines
            if char == '\n':
                self.tokens.append(Token(TokenType.NEWLINE, char, line, column))
                self.advance()
                continue

            # Handle numbers
            if char.isdigit():
                self.tokens.append(self.read_number())
                continue

            # Handle step variable
            if char == '$':
                self.tokens.append(self.read_step_variable())
                continue

            # Handle strings
            if char == '"':
                self.tokens.append(self.read_string())
                continue

            # Handle identifiers and keywords
            if char.isalpha() or char == '_':
                self.tokens.append(self.read_identifier())
                continue

            # Handle operators and delimiters
            if char == '+':
                self.tokens.append(Token(TokenType.PLUS, char, line, column))
            elif char == '-':
                self.tokens.append(Token(TokenType.MINUS, char, line, column))
            elif char == '*':
                self.tokens.append(Token(TokenType.MULTIPLY, char, line, column))
            elif char == '/':
                self.tokens.append(Token(TokenType.DIVIDE, char, line, column))
            elif char == '=':
                if self.peek_char() == '=':
                    self.advance()
                    self.tokens.append(Token(TokenType.EQUALS, '==', line, column))
                else:
                    self.tokens.append(Token(TokenType.ASSIGN, char, line, column))
            elif char == '>':
                if self.peek_char() == '=':
                    self.advance()
                    self.tokens.append(Token(TokenType.GREATER_EQUAL, '>=', line, column))
                else:
                    self.tokens.append(Token(TokenType.GREATER_THAN, char, line, column))
            elif char == '<':
                if self.peek_char() == '=':
                    self.advance()
                    self.tokens.append(Token(TokenType.LESS_EQUAL, '<=', line, column))
                else:
                    self.tokens.append(Token(TokenType.LESS_THAN, char, line, column))
            elif char == '{':
                self.tokens.append(Token(TokenType.LEFT_BRACE, char, line, column))
            elif char == '}':
                self.tokens.append(Token(TokenType.RIGHT_BRACE, char, line, column))
            elif char == '(':
                self.tokens.append(Token(TokenType.LEFT_PAREN, char, line, column))
            elif char == ')':
                self.tokens.append(Token(TokenType.RIGHT_PAREN, char, line, column))
            elif char == '[':
                self.tokens.append(Token(TokenType.LEFT_BRACKET, char, line, column))
            elif char == ']':
                self.tokens.append(Token(TokenType.RIGHT_BRACKET, char, line, column))
            elif char == ',':
                self.tokens.append(Token(TokenType.COMMA, char, line, column))
            elif char == ':':
                self.tokens.append(Token(TokenType.COLON, char, line, column))
            elif char == '.':
                self.tokens.append(Token(TokenType.DOT, char, line, column))
            else:
                raise SyntaxError(f"Unexpected character '{char}' at line {line}, column {column}")

            self.advance()

        # Add EOF token
        self.tokens.append(Token(TokenType.EOF, "", self.line, self.column))
        return self.tokens


def tokenize_file(filename: str) -> List[Token]:
    """Convenience function to tokenize a file."""
    with open(filename, 'r') as f:
        content = f.read()

    tokenizer = Tokenizer(content)
    return tokenizer.tokenize()


if __name__ == "__main__":
    # Test with a simple example
    test_code = """
    module const {
        param value
        output value
    }
    """

    tokenizer = Tokenizer(test_code)
    tokens = tokenizer.tokenize()

    for token in tokens:
        if token.type != TokenType.NEWLINE:
            print(f"{token.type.value}: '{token.value}' at {token.line}:{token.column}")