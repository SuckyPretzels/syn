const fs = require(`fs`);
const errors = [];
run(
    `
make x = 5
say y
`
);

function run(code) {
    code = findCode(code);

    if (!code) {
        console.log("No program provided");
        return;
    }

    const tokens = tokenizer(code);
    const ast = parser(tokens);
    // console.log(JSON.stringify(tokens, null, 2));
    // console.log(JSON.stringify(ast, null, 2));
    execute(ast);
}

function findCode(input) {
    if (process.argv.length > 2) {
        const filename = process.argv[2];

        try {
            if (typeof filename === "string" && filename.endsWith(".syn")) {
                const code = fs.readFileSync(filename, "utf-8");
                return code;
            } else {
                return code;
            }
        } catch(err) {
            console.error(`Error reading file ${filename}`, err.message);
        }
    } else if (input && typeof input === "string") {
        return input;
    }
    return null;
}

function validateNumber(value) {
    if (/^-?[\d.]+$/.test(value)) {
        return true;
    }
    return false;
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
        const nextChar = code[i+1];

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

            if (char === "-" && getType(nextChar) === "number") {
                current += char;
            } else if (operators.has(char)) {
                tokens.push({
                    type: getType(char), 
                    value: char,
                    line: line,
                    column: column
                });
            }
        } else if(inQuotes && char === "\n") {
            reportError("unterminated string", { line, column });
            inQuotes = false;
            current = "";
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

    if (inQuotes) {
        reportError("unterminated string at the end of file", { line, column });
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
        reportError("unknown keyword", token);
        return null;
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
            if (token.type === "identifier" && validateNumber(token.value)) {
                reportError(`invalid number '${token.value}'`, token);
            }
            
            stack.push({
                type: token.type === "identifier" ? "variable" : "literal",
                value: token.value,
                valueType: token.type,
                line: token.line,
                column: token.column
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
                    operator: token.value,
                    line: token.line,
                    column: token.column
                });
            } else {
                reportError(`not enough operands for operator`, token);
                return null;
            }
            i++;
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
    } else if (stack.length > 1) {
        return {
            node: stack[0],
            consumed: 1
        };
    }
    return null;
}

// keyword parsers
function parseSay(tokens, index) {
    let i = index + 1;
    let consumed = 1;
    const keyword = tokens[index];
    const expressions = [];

    while (i < tokens.length) {
        if (tokens[i] && tokens[i].type === "keyword") {
            break;
        }
        const result = parseExpression(tokens, i);

        if (!result) {
            break;
        }

        expressions.push(result.node);
        consumed += result.consumed;
        i+=result.consumed;
    }

    if (expressions.length === 0) {
        reportError(`missing expression`, keyword);
    }

    return {
        node: {
            type: "say", 
            expressions: expressions,
            line: keyword.line,
            column: keyword.column
        },
        consumed: consumed
    };
}
function parseMake(tokens, index) {
    if (index+3 >= tokens.length) {
        reportError(`missing variable declaration at end of file`);
        return null;
    } else {
        const keyword = tokens[index];
        const nameToken = tokens[index+1];
        const opToken = tokens[index+2];
        
        if (nameToken.type !== "identifier") {
            reportError(`invalid variable name '${nameToken.value}'`, nameToken);
        } if (opToken.value !== "=") {
            reportError(`missing variable declaration '='`, opToken);
        }


        const result = parseExpression(tokens, index+3);
        if (!result) {
            reportError("missing expression", keyword);
            return null;
        }

        return {
            node: {
                type: "make",
                name: nameToken.value,
                expression: result.node,
                line: keyword.line,
                column: keyword.column,
            },
            consumed: 3 + result.consumed
        };
    }
}

function execute(ast) {
    const context = {};
    // this is the dictionary with all the variables and their values

    const runtime = {
        say: (node, context) => say(node, context),
        make: (node, context) => make(node, context)
    };
    for (let node of ast) {
        runtime[node.type]?.(node, context);
        // square brackets allow me to reference a variable when trying to pull a value from an object.
        // the "?." means, only execute this if it exists.
        if (errors.length > 0) {
            displayErrors(errors);
            return;
        }
    }
    displayErrors(errors);
}

// behavior functions
function say(node, context) {
    if (!node.expressions || node.expressions.length === 0) {
        return;
    }

    const parts = [];

    for(let expr of node.expressions) {
        let value;

        if (expr.type === "math") {
            value = math(expr, context);
        }
        else if (expr.type === "variable") {
            if ((expr.value in context)) {
                value = context[expr.value];
            } else {
                reportError(`unknown variable '${expr.value}'`, expr);
                value = null;
            }
        } else {
            value = expr.value;
        }

        if (value !== null) {
            parts.push(String(value));
        }
    }

    if (parts.length > 0) {
        console.log(parts.join(""));
    }
}
function make(node, context) {
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
        if (right === 0) {
            reportError(`division by 0 '${left} ${right} ${op}'`);
            return null;
        }
        return left / right;
    default:
        reportError("unknown operator", expression);
        return null;
    }

    function evaluateOperand(operand, context) {
        if (!operand) {
            return null;
        }

        if (operand.type === "literal") {
            if (operand.valueType === "number") {
                return Number(operand.value);
            } else {
                reportError(`attempting to do math with non-numbers '${operand.value}'`, operand);
            }
        }

        if (operand.type === "variable") {
            if (operand.value !== undefined) {
                return context[operand.value];
            } else {
                reportError(`variable '${operand.value}' is undefined`, operand);
                return null;
            }
        }

        if (operand.type === "math") {
            return math(operand, context);
        }

        return null;
    }
}

// error functions
function reportError(msg, token) {
    errors.push({
        message: msg,
        line: token?.line,
        column: token?.column
    });
}
function displayErrors(errors) {
    errors.sort((a, b) => {
        if (a.line !== b.line) {
            return a.line - b.line;
        }
        return a.column - b.column;
    });

    for (const err of errors) {
        if (err.line !== undefined && err.column !== undefined) {
            console.log(`Error at line ${err.line} : column ${err.column} - ${err.message}`);
        } else {
            console.log(`Error - `+err.message);
        }
    } process.exit(1);
}
