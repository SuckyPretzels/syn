run(
    `

` 
);

function run(code) {
    const tokens = tokenizer(code);
    const ast = parser(tokens);
    execute(ast);
}

function tokenizer(code) {
    const keywords = new Set(["say","make"]);
    const operators = new Set(["+","-","*","/","="]);
    // this creates a new Set() object. Sets are not like arrays, they are lookup tables.

    function getType(value) {
        if (keywords.has(value)) {
            return "keyword";
        }
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            return "number";
        }
        if (/^".*"$/.test(value)) {
            return "string";
        }
        if (operators.has(value)) {
            return "operator";
        }
        return "identifier";
    }

    const tokens = [];
    let current = "";
    let inQuotes = false;
    let line = 1;
    let column = 1;
    let startLine = 1;
    let startColumn = 1;

    for (let i = 0; i < code.length; i++) {
        const char = code[i];

        if (current.length === 0 && char !== " " && char !== "\n") {
            startLine = line;
            startColumn = column;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            current += char;
        } else if ((char === " " || char === "\n" || operators.has(char)) && !inQuotes) {
            if (current.length > 0) {
                tokens.push({
                    type: getType(current),
                    value: current,
                    line: startLine,
                    column: startColumn
                });
                current = "";
            }
            if (operators.has(char)) {
                tokens.push({
                    type: getType(char), 
                    value: char,
                    line: line,
                    column: column
                });
            }
        } else {
            current += char;
        }

        if (char === "\n") {
            line++;
            column = 1;
        } else {
            column++;
        }
    }
    
    if (current.length > 0) {
        tokens.push({
            type: getType(current),
            value: current,
            line: startLine,
            column: startColumn
        });
    }

    return tokens;
}

function parser(tokens) {
    const ast = [];
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        if (token.type === "keyword") {
            let result = parseKeyword(tokens, i);
            if (result && result.node) {
                ast.push(result.node);
                i+=result.consumed;
            } else {
                i++;
            }
        } else {
            i++;
        }
    }
    return ast;
}

// parser helpers
function parseKeyword(tokens, index) {
    const token = tokens[index];
    switch (token.value) {
    case "say":
        return parseSay(tokens, index);

    case "make":
        return parseMake(tokens, index);

    default:
        return null;
    }

    function parseSay(tokens, index) {
        if (index+1 >= tokens.length) {
            return null;
        } else {
            const result = parseExpression(tokens, index+1);

            if (!result) {
                return null;
            }

            return {
                node: {
                    type: "say", 
                    expression: result.node,
                },
                consumed: 1 + result.consumed
            };
        }
    }
    function parseMake(tokens, index) {
        if (index+3 >= tokens.length) {
            return null;
        } else {
            const nameToken = tokens[index+1];
            const opToken = tokens[index+2];
            
            if (nameToken.type !== "identifier" || opToken.value !== "=") {
                return null;
            }

            const result = parseExpression(tokens, index+3);
            if (!result) {
                return null;
            }
            return {
                node: {
                    type: "make",
                    name: nameToken.value,
                    expression: result.node
                },
                consumed: 3 + result.consumed
            };
        }
    }
}
function parseExpression(tokens, startIndex) {
    const stack = [];
    let i = startIndex;
    
    while (i < tokens.length) {
        const token = tokens[i];

        if (token.type === "number" || token.type === "string" || token.type === "identifier" ) {
            if (token.type === "string") {
                token.value = token.value.replace(/^"|"$/g, "");
            }
            
            stack.push({
                type: token.type === "identifier" ? "variable" : "literal",
                value: token.value,
                valueType: token.type
            });
            i++;
        }
        
        else if (token.type === "operator") {
            if (stack.length >= 2) {
                const right = stack.pop();
                const left = stack.pop();
                
                stack.push({
                    type: "math",
                    left: left,
                    right: right,
                    operator: token.value
                });
            }
            i++; // unknown token type, skip.
        } 
        
        else if (token.type === "keyword") {
            break;
        } else {
            i++;
        }
    } 

    if (stack.length === 1) {
        return {
            node: stack[0],
            consumed: i - startIndex
        };
    }
    return null;
}

function execute(ast) {
    const context = {};
    // this is the dictionary with all the variables and their values

    const runtime = {
        say: (node, context) => sayFunction(node, context),
        make: (node, context) => makeFunction(node, context)
    };
    for (let node of ast) {
        runtime[node.type]?.(node, context);
        // square brackets allow me to reference a variable when trying to pull a value from an object.
        // the "?." means, only execute this if it exists.
    }
}

// behavior functions
function sayFunction(node, context) {
    const expr = node.expression;
    if (!expr) {
        return;
    }

    let value;

    if (expr.type === "math") {
        value = math(expr, context);
    } else if (expr.type === "variable") {
        value = context[expr.value] !== undefined ?
            context[expr.value] :
            expr.value;
    } else {
        value = expr.value;
    }

    console.log(value);
}
function makeFunction(node, context) {
    const expr = node.expression;
    if (!expr) {
        return;
    }

    let value;

    if (expr.type === "math") {
        value = math(expr, context);
    } else if (expr.type === "variable") {
        value = context[expr.value] !== undefined ?
            context[expr.value] :
            expr.value;
    } else {
        value = expr.valueType === "number" ?
            Number(expr.value) :
            expr.value;
    }
    context[node.name] = value;
}
function math(expression, context) {
    if (!expression || expression.type !== "math") {
        return null;
    }

    const op = expression.operator;
    const left = evaluateOperand(expression.left, context);
    const right = evaluateOperand(expression.right, context);

    switch(op) {
    case "+":
        return left + right;
    case "-":
        return left - right;
    case "*":
        return left * right;
    case "/":
        return left / right;
    default:
        return null;
    }

    function evaluateOperand(operand, context) {
        if (!operand) {
            return null;
        }

        if (operand.type === "literal") {
            return operand.valueType === "number" ?
                Number(operand.value) :
                operand.value;
        }

        if (operand.type === "variable") {
            return context[operand.value] !== undefined ?
                context[operand.value] :
                operand.value;
        }

        if (operand.type === "math") {
            return math(operand, context);
        }
        return null;
    }
}
