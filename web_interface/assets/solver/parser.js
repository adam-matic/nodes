/**
 * Parser for the Modular Math Language.
 * JavaScript port of modular_math/parser.py and ast_nodes.py — keep in sync.
 *
 * AST nodes are plain objects tagged with a `kind` field:
 *   Identifier, NumberLiteral, StepVariable, BinaryOperation, FunctionCall,
 *   ModuleInstantiation, DotAccess, Assignment, InputDeclaration,
 *   ParameterDeclaration, OutputDeclaration, HaltStatement, ImportStatement,
 *   ModuleDefinition, ExecutionBlock, Program
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./tokenizer.js'));
    } else {
        Object.assign(root, factory(root));
    }
})(typeof self !== 'undefined' ? self : this, function (tokenizerModule) {
    const { TokenType, Tokenizer } = tokenizerModule;

    const AST = {
        identifier: (name) => ({ kind: 'Identifier', name }),
        numberLiteral: (value) => ({ kind: 'NumberLiteral', value }),
        stepVariable: () => ({ kind: 'StepVariable' }),
        binaryOperation: (left, operator, right) => ({ kind: 'BinaryOperation', left, operator, right }),
        functionCall: (name, args) => ({ kind: 'FunctionCall', name, arguments: args }),
        moduleInstantiation: (moduleName, parameters) => ({ kind: 'ModuleInstantiation', moduleName, parameters }),
        dotAccess: (object, member) => ({ kind: 'DotAccess', object, member }),
        assignment: (target, value) => ({ kind: 'Assignment', target, value }),
        inputDeclaration: (name) => ({ kind: 'InputDeclaration', name }),
        parameterDeclaration: (name, defaultValue = null) => ({ kind: 'ParameterDeclaration', name, defaultValue }),
        outputDeclaration: (name) => ({ kind: 'OutputDeclaration', name }),
        haltStatement: (condition) => ({ kind: 'HaltStatement', condition }),
        importStatement: (moduleName, modulePath = null) => ({ kind: 'ImportStatement', moduleName, modulePath }),
        moduleDefinition: (name, body) => ({ kind: 'ModuleDefinition', name, body }),
        executionBlock: (maxSteps, stopWhen, save, plot) => ({ kind: 'ExecutionBlock', maxSteps, stopWhen, save, plot }),
        program: (imports, modules, execution) => ({ kind: 'Program', imports, modules, execution }),
    };

    class ParseError extends Error {
        constructor(message, token) {
            super(`${message} at line ${token.line}, column ${token.column}`);
            this.name = 'ParseError';
            this.token = token;
        }
    }

    const BUILTIN_NAMES = ['add', 'sub', 'mul', 'mult', 'div', 'mem', 'gt', 'lt', 'eq', 'gte', 'lte'];

    class Parser {
        constructor(tokens) {
            this.tokens = tokens;
            this.position = 0;
        }

        currentToken() {
            if (this.position >= this.tokens.length) {
                return this.tokens[this.tokens.length - 1]; // EOF token
            }
            return this.tokens[this.position];
        }

        peekToken(offset = 1) {
            const peekPos = this.position + offset;
            if (peekPos >= this.tokens.length) {
                return this.tokens[this.tokens.length - 1]; // EOF token
            }
            return this.tokens[peekPos];
        }

        advance() {
            const token = this.currentToken();
            if (this.position < this.tokens.length - 1) {
                this.position += 1;
            }
            return token;
        }

        expect(tokenType) {
            const token = this.currentToken();
            if (token.type !== tokenType) {
                throw new ParseError(`Expected ${tokenType}, got ${token.type}`, token);
            }
            return this.advance();
        }

        match(...tokenTypes) {
            return tokenTypes.includes(this.currentToken().type);
        }

        skipNewlines() {
            while (this.match(TokenType.NEWLINE)) {
                this.advance();
            }
        }

        parse() {
            const imports = [];
            const modules = [];
            let execution = null;

            this.skipNewlines();

            while (!this.match(TokenType.EOF)) {
                this.skipNewlines();

                if (this.match(TokenType.IMPORT)) {
                    imports.push(this.parseImport());
                } else if (this.match(TokenType.MODULE)) {
                    modules.push(this.parseModule());
                } else if (this.match(TokenType.EXECUTION)) {
                    if (execution !== null) {
                        throw new ParseError('Multiple execution blocks not allowed', this.currentToken());
                    }
                    execution = this.parseExecutionBlock();
                } else {
                    // Top-level module instantiation (for single module files)
                    if (this.match(TokenType.IDENTIFIER) && this.peekToken().type === TokenType.LEFT_BRACE) {
                        modules.push(this.parseModule());
                    } else {
                        throw new ParseError(`Unexpected token ${this.currentToken().type}`, this.currentToken());
                    }
                }

                this.skipNewlines();
            }

            return AST.program(imports, modules, execution);
        }

        parseImport() {
            this.expect(TokenType.IMPORT);
            const moduleName = this.expect(TokenType.IDENTIFIER).value;

            let modulePath = null;
            if (this.match(TokenType.FROM)) {
                this.advance(); // consume 'from'
                modulePath = this.expect(TokenType.STRING).value;
            }

            this.skipNewlines();
            return AST.importStatement(moduleName, modulePath);
        }

        parseModule() {
            this.expect(TokenType.MODULE);
            const name = this.expect(TokenType.IDENTIFIER).value;
            this.expect(TokenType.LEFT_BRACE);
            this.skipNewlines();

            const body = [];
            while (!this.match(TokenType.RIGHT_BRACE, TokenType.EOF)) {
                this.skipNewlines();
                if (this.match(TokenType.RIGHT_BRACE)) break;

                const stmt = this.parseStatement();
                if (stmt) body.push(stmt);
                this.skipNewlines();
            }

            this.expect(TokenType.RIGHT_BRACE);
            return AST.moduleDefinition(name, body);
        }

        parseStatement() {
            if (this.match(TokenType.INPUT)) {
                return this.parseInputDeclaration();
            } else if (this.match(TokenType.PARAM)) {
                return this.parseParameterDeclaration();
            } else if (this.match(TokenType.OUTPUT)) {
                // Check if this is an output declaration or assignment
                const nextToken = this.peekToken();
                if ([TokenType.IDENTIFIER, TokenType.OUTPUT, TokenType.STEP_VARIABLE].includes(nextToken.type) &&
                    this.peekToken(2).type !== TokenType.ASSIGN) {
                    return this.parseOutputDeclaration();
                } else {
                    // Treat as assignment (output = ...)
                    return this.parseAssignment();
                }
            } else if (this.match(TokenType.HALT)) {
                return this.parseHaltStatement();
            } else if (this.match(TokenType.IDENTIFIER)) {
                return this.parseAssignment();
            } else {
                if (!this.match(TokenType.NEWLINE, TokenType.EOF, TokenType.RIGHT_BRACE)) {
                    throw new ParseError(`Unexpected token in statement: ${this.currentToken().type}`, this.currentToken());
                }
                return null;
            }
        }

        parseInputDeclaration() {
            this.expect(TokenType.INPUT);
            const name = this.expect(TokenType.IDENTIFIER).value;
            return AST.inputDeclaration(name);
        }

        parseParameterDeclaration() {
            this.expect(TokenType.PARAM);
            const name = this.expect(TokenType.IDENTIFIER).value;

            let defaultValue = null;
            if (this.match(TokenType.ASSIGN)) {
                this.advance();
                defaultValue = this.parseExpression();
            }

            return AST.parameterDeclaration(name, defaultValue);
        }

        parseOutputDeclaration() {
            this.expect(TokenType.OUTPUT);
            if (this.match(TokenType.IDENTIFIER, TokenType.STEP_VARIABLE)) {
                const name = this.advance().value;
                return AST.outputDeclaration(name);
            }
            throw new ParseError('Expected identifier for output name', this.currentToken());
        }

        parseHaltStatement() {
            this.expect(TokenType.HALT);
            this.expect(TokenType.LEFT_PAREN);
            const condition = this.parseExpression();
            this.expect(TokenType.RIGHT_PAREN);
            return AST.haltStatement(condition);
        }

        parseAssignment() {
            let target;
            if (this.match(TokenType.IDENTIFIER)) {
                target = this.advance().value;
            } else {
                throw new ParseError('Expected identifier for assignment target', this.currentToken());
            }

            this.expect(TokenType.ASSIGN);
            const value = this.parseExpression();
            return AST.assignment(target, value);
        }

        parseExecutionBlock() {
            this.expect(TokenType.EXECUTION);
            this.expect(TokenType.LEFT_BRACE);
            this.skipNewlines();

            let maxSteps = null;
            let stopWhen = null;
            let save = null;
            let plot = null;

            while (!this.match(TokenType.RIGHT_BRACE, TokenType.EOF)) {
                this.skipNewlines();
                if (this.match(TokenType.RIGHT_BRACE)) break;

                if (!this.match(TokenType.IDENTIFIER)) {
                    throw new ParseError('Expected identifier in execution block', this.currentToken());
                }

                const key = this.advance().value;
                this.expect(TokenType.COLON);

                if (key === 'max_steps') {
                    if (!this.match(TokenType.NUMBER)) {
                        throw new ParseError('Expected number for max_steps', this.currentToken());
                    }
                    maxSteps = Math.trunc(parseFloat(this.advance().value));
                } else if (key === 'stop_when') {
                    stopWhen = this.parseExpression();
                } else if (key === 'save') {
                    save = this.parseExpressionList();
                } else if (key === 'plot') {
                    plot = this.parseExpressionList();
                } else {
                    throw new ParseError(`Unknown execution block key: ${key}`, this.currentToken());
                }

                this.skipNewlines();
            }

            this.expect(TokenType.RIGHT_BRACE);
            return AST.executionBlock(maxSteps, stopWhen, save, plot);
        }

        parseExpressionList() {
            this.expect(TokenType.LEFT_BRACKET);
            const expressions = [];

            if (!this.match(TokenType.RIGHT_BRACKET)) {
                expressions.push(this.parseExpression());

                while (this.match(TokenType.COMMA)) {
                    this.advance();
                    expressions.push(this.parseExpression());
                }
            }

            this.expect(TokenType.RIGHT_BRACKET);
            return expressions;
        }

        parseExpression() {
            return this.parseComparison();
        }

        parseComparison() {
            let expr = this.parseArithmetic();

            while (this.match(TokenType.EQUALS, TokenType.GREATER_THAN, TokenType.LESS_THAN,
                              TokenType.GREATER_EQUAL, TokenType.LESS_EQUAL)) {
                const operator = this.advance().value;
                const right = this.parseArithmetic();
                expr = AST.binaryOperation(expr, operator, right);
            }

            return expr;
        }

        parseArithmetic() {
            let expr = this.parseTerm();

            while (this.match(TokenType.PLUS, TokenType.MINUS)) {
                const operator = this.advance().value;
                const right = this.parseTerm();
                expr = AST.binaryOperation(expr, operator, right);
            }

            return expr;
        }

        parseTerm() {
            let expr = this.parseFactor();

            while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE)) {
                const operator = this.advance().value;
                const right = this.parseFactor();
                expr = AST.binaryOperation(expr, operator, right);
            }

            return expr;
        }

        parseFactor() {
            if (this.match(TokenType.MINUS)) {
                this.advance();
                const expr = this.parseFactor();
                return AST.binaryOperation(AST.numberLiteral(0.0), '-', expr);
            } else if (this.match(TokenType.PLUS)) {
                this.advance();
                return this.parseFactor();
            } else {
                return this.parsePostfix();
            }
        }

        parsePostfix() {
            let expr = this.parsePrimary();

            for (;;) {
                if (this.match(TokenType.LEFT_PAREN)) {
                    // Function call or module instantiation
                    if (expr.kind === 'Identifier') {
                        if (BUILTIN_NAMES.includes(expr.name)) {
                            expr = this.parseFunctionCall(expr.name);
                        } else {
                            expr = this.parseModuleInstantiation(expr.name);
                        }
                    } else {
                        throw new ParseError('Can only call functions or instantiate modules', this.currentToken());
                    }
                } else if (this.match(TokenType.DOT)) {
                    this.advance();
                    const member = this.expect(TokenType.IDENTIFIER).value;
                    expr = AST.dotAccess(expr, member);
                } else {
                    break;
                }
            }

            return expr;
        }

        parsePrimary() {
            if (this.match(TokenType.NUMBER)) {
                const value = parseFloat(this.advance().value);
                return AST.numberLiteral(value);
            }

            if (this.match(TokenType.IDENTIFIER)) {
                const name = this.advance().value;
                return AST.identifier(name);
            }

            if (this.match(TokenType.STEP_VARIABLE)) {
                this.advance();
                return AST.stepVariable();
            }

            if (this.match(TokenType.LEFT_PAREN)) {
                this.advance();
                const expr = this.parseExpression();
                this.expect(TokenType.RIGHT_PAREN);
                return expr;
            }

            // Handle built-in functions directly
            if (this.match(TokenType.ADD, TokenType.SUB, TokenType.MUL, TokenType.DIV,
                           TokenType.MEM, TokenType.GT, TokenType.LT, TokenType.EQ,
                           TokenType.GTE, TokenType.LTE)) {
                const funcName = this.advance().value;
                return this.parseFunctionCall(funcName);
            }

            throw new ParseError(`Unexpected token in expression: ${this.currentToken().type}`, this.currentToken());
        }

        parseFunctionCall(functionName) {
            this.expect(TokenType.LEFT_PAREN);
            const args = [];

            if (!this.match(TokenType.RIGHT_PAREN)) {
                args.push(this.parseExpression());

                while (this.match(TokenType.COMMA)) {
                    this.advance();
                    args.push(this.parseExpression());
                }
            }

            this.expect(TokenType.RIGHT_PAREN);
            return AST.functionCall(functionName, args);
        }

        parseModuleInstantiation(moduleName) {
            this.expect(TokenType.LEFT_PAREN);
            const parameters = {};

            if (!this.match(TokenType.RIGHT_PAREN)) {
                let paramName = this.expect(TokenType.IDENTIFIER).value;
                this.expect(TokenType.ASSIGN);
                parameters[paramName] = this.parseExpression();

                while (this.match(TokenType.COMMA)) {
                    this.advance();
                    paramName = this.expect(TokenType.IDENTIFIER).value;
                    this.expect(TokenType.ASSIGN);
                    parameters[paramName] = this.parseExpression();
                }
            }

            this.expect(TokenType.RIGHT_PAREN);
            return AST.moduleInstantiation(moduleName, parameters);
        }
    }

    function parseString(content) {
        const tokenizer = new Tokenizer(content);
        const tokens = tokenizer.tokenize();
        const parser = new Parser(tokens);
        return parser.parse();
    }

    return { AST, ParseError, Parser, parseString };
});
