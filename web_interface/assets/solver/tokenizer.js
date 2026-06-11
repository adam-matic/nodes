/**
 * Tokenizer for the Modular Math Language.
 * JavaScript port of modular_math/tokenizer.py — keep the two in sync.
 * Works both in the browser (globals) and Node (module.exports).
 */

const TokenType = {
    // Keywords
    MODULE: 'MODULE',
    INPUT: 'INPUT',
    PARAM: 'PARAM',
    OUTPUT: 'OUTPUT',
    EXECUTION: 'EXECUTION',
    IMPORT: 'IMPORT',
    FROM: 'FROM',
    HALT: 'HALT',

    // Identifiers and literals
    IDENTIFIER: 'IDENTIFIER',
    NUMBER: 'NUMBER',
    STRING: 'STRING',

    // Operators
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    MULTIPLY: 'MULTIPLY',
    DIVIDE: 'DIVIDE',
    ASSIGN: 'ASSIGN',
    EQUALS: 'EQUALS',
    GREATER_THAN: 'GREATER_THAN',
    LESS_THAN: 'LESS_THAN',
    GREATER_EQUAL: 'GREATER_EQUAL',
    LESS_EQUAL: 'LESS_EQUAL',

    // Delimiters
    LEFT_BRACE: 'LEFT_BRACE',
    RIGHT_BRACE: 'RIGHT_BRACE',
    LEFT_PAREN: 'LEFT_PAREN',
    RIGHT_PAREN: 'RIGHT_PAREN',
    LEFT_BRACKET: 'LEFT_BRACKET',
    RIGHT_BRACKET: 'RIGHT_BRACKET',
    COMMA: 'COMMA',
    COLON: 'COLON',
    DOT: 'DOT',

    // Special
    STEP_VARIABLE: 'STEP_VARIABLE', // $step
    NEWLINE: 'NEWLINE',
    EOF: 'EOF',

    // Built-in functions
    ADD: 'ADD',
    SUB: 'SUB',
    MUL: 'MUL',
    DIV: 'DIV',
    MEM: 'MEM',
    GT: 'GT',
    LT: 'LT',
    EQ: 'EQ',
    GTE: 'GTE',
    LTE: 'LTE',
};

const KEYWORDS = {
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
    'mult': TokenType.MUL, // Alternative name used in examples
    'div': TokenType.DIV,
    'mem': TokenType.MEM,
    'gt': TokenType.GT,
    'lt': TokenType.LT,
    'eq': TokenType.EQ,
    'gte': TokenType.GTE,
    'lte': TokenType.LTE,
};

function isDigit(ch) {
    return ch >= '0' && ch <= '9';
}

function isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isAlnum(ch) {
    return isAlpha(ch) || isDigit(ch);
}

class Token {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
}

class Tokenizer {
    constructor(text) {
        this.text = text;
        this.position = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
    }

    currentChar() {
        if (this.position >= this.text.length) return null;
        return this.text[this.position];
    }

    peekChar(offset = 1) {
        const peekPos = this.position + offset;
        if (peekPos >= this.text.length) return null;
        return this.text[peekPos];
    }

    advance() {
        if (this.position < this.text.length && this.text[this.position] === '\n') {
            this.line += 1;
            this.column = 1;
        } else {
            this.column += 1;
        }
        this.position += 1;
    }

    skipWhitespace() {
        while (this.currentChar() && ' \t\r'.includes(this.currentChar())) {
            this.advance();
        }
    }

    readNumber() {
        const startLine = this.line, startColumn = this.column;
        let value = '';

        while (this.currentChar() && (isDigit(this.currentChar()) || this.currentChar() === '.')) {
            value += this.currentChar();
            this.advance();
        }

        return new Token(TokenType.NUMBER, value, startLine, startColumn);
    }

    readIdentifier() {
        const startLine = this.line, startColumn = this.column;
        let value = '';

        while (this.currentChar() && (isAlnum(this.currentChar()) || this.currentChar() === '_')) {
            value += this.currentChar();
            this.advance();
        }

        const tokenType = Object.prototype.hasOwnProperty.call(KEYWORDS, value)
            ? KEYWORDS[value] : TokenType.IDENTIFIER;
        return new Token(tokenType, value, startLine, startColumn);
    }

    readStepVariable() {
        const startLine = this.line, startColumn = this.column;
        let value = '';

        if (this.currentChar() === '$') {
            value += this.currentChar();
            this.advance();

            while (this.currentChar() && isAlpha(this.currentChar())) {
                value += this.currentChar();
                this.advance();
            }
        }

        return new Token(TokenType.STEP_VARIABLE, value, startLine, startColumn);
    }

    readString() {
        const startLine = this.line, startColumn = this.column;
        let value = '';

        // Skip opening quote
        this.advance();

        while (this.currentChar() && this.currentChar() !== '"') {
            if (this.currentChar() === '\\') {
                this.advance();
                if (this.currentChar() === 'n') value += '\n';
                else if (this.currentChar() === 't') value += '\t';
                else if (this.currentChar() === '\\') value += '\\';
                else if (this.currentChar() === '"') value += '"';
                else value += this.currentChar();
            } else {
                value += this.currentChar();
            }
            this.advance();
        }

        if (!this.currentChar()) {
            throw new Error(`Unterminated string starting on line ${startLine}`);
        }

        // Skip closing quote
        this.advance();

        return new Token(TokenType.STRING, value, startLine, startColumn);
    }

    tokenize() {
        while (this.currentChar()) {
            this.skipWhitespace();

            if (!this.currentChar()) break;

            const char = this.currentChar();
            const line = this.line, column = this.column;

            // Handle comments
            if (char === '/' && this.peekChar() === '/') { // Single-line comment
                while (this.currentChar() && this.currentChar() !== '\n') {
                    this.advance();
                }
                continue;
            } else if (char === '/' && this.peekChar() === '*') { // Multi-line comment
                this.advance(); // consume '/'
                this.advance(); // consume '*'
                const startLine = this.line;
                let closed = false;
                while (this.currentChar()) {
                    if (this.currentChar() === '*' && this.peekChar() === '/') {
                        this.advance(); // consume '*'
                        this.advance(); // consume '/'
                        closed = true;
                        break;
                    }
                    this.advance();
                }
                if (!closed) {
                    throw new Error(`Unterminated multi-line comment starting on line ${startLine}`);
                }
                continue;
            }

            // Handle newlines
            if (char === '\n') {
                this.tokens.push(new Token(TokenType.NEWLINE, char, line, column));
                this.advance();
                continue;
            }

            // Handle numbers
            if (isDigit(char)) {
                this.tokens.push(this.readNumber());
                continue;
            }

            // Handle step variable
            if (char === '$') {
                this.tokens.push(this.readStepVariable());
                continue;
            }

            // Handle strings
            if (char === '"') {
                this.tokens.push(this.readString());
                continue;
            }

            // Handle identifiers and keywords
            if (isAlpha(char) || char === '_') {
                this.tokens.push(this.readIdentifier());
                continue;
            }

            // Handle operators and delimiters
            if (char === '+') {
                this.tokens.push(new Token(TokenType.PLUS, char, line, column));
            } else if (char === '-') {
                this.tokens.push(new Token(TokenType.MINUS, char, line, column));
            } else if (char === '*') {
                this.tokens.push(new Token(TokenType.MULTIPLY, char, line, column));
            } else if (char === '/') {
                this.tokens.push(new Token(TokenType.DIVIDE, char, line, column));
            } else if (char === '=') {
                if (this.peekChar() === '=') {
                    this.advance();
                    this.tokens.push(new Token(TokenType.EQUALS, '==', line, column));
                } else {
                    this.tokens.push(new Token(TokenType.ASSIGN, char, line, column));
                }
            } else if (char === '>') {
                if (this.peekChar() === '=') {
                    this.advance();
                    this.tokens.push(new Token(TokenType.GREATER_EQUAL, '>=', line, column));
                } else {
                    this.tokens.push(new Token(TokenType.GREATER_THAN, char, line, column));
                }
            } else if (char === '<') {
                if (this.peekChar() === '=') {
                    this.advance();
                    this.tokens.push(new Token(TokenType.LESS_EQUAL, '<=', line, column));
                } else {
                    this.tokens.push(new Token(TokenType.LESS_THAN, char, line, column));
                }
            } else if (char === '{') {
                this.tokens.push(new Token(TokenType.LEFT_BRACE, char, line, column));
            } else if (char === '}') {
                this.tokens.push(new Token(TokenType.RIGHT_BRACE, char, line, column));
            } else if (char === '(') {
                this.tokens.push(new Token(TokenType.LEFT_PAREN, char, line, column));
            } else if (char === ')') {
                this.tokens.push(new Token(TokenType.RIGHT_PAREN, char, line, column));
            } else if (char === '[') {
                this.tokens.push(new Token(TokenType.LEFT_BRACKET, char, line, column));
            } else if (char === ']') {
                this.tokens.push(new Token(TokenType.RIGHT_BRACKET, char, line, column));
            } else if (char === ',') {
                this.tokens.push(new Token(TokenType.COMMA, char, line, column));
            } else if (char === ':') {
                this.tokens.push(new Token(TokenType.COLON, char, line, column));
            } else if (char === '.') {
                this.tokens.push(new Token(TokenType.DOT, char, line, column));
            } else {
                throw new Error(`Unexpected character '${char}' at line ${line}, column ${column}`);
            }

            this.advance();
        }

        // Add EOF token
        this.tokens.push(new Token(TokenType.EOF, '', this.line, this.column));
        return this.tokens;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TokenType, Token, Tokenizer };
} else {
    const root = typeof self !== 'undefined' ? self : this;
    Object.assign(root, { TokenType, Token, Tokenizer });
}
