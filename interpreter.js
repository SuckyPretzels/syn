run(
    `print "Hello World"
print "i love you"
let x = 5
print x`
  
);

function run(code) {
    const tokens = tokenizer(code);
    const ast = parser(tokens);
    execute(ast);
}

function tokenizer(code) {
    const keywords = new Set(["print","let"]);
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
        if (value === "=") {
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
        } else if ((char === " " || char === "\n" || char === "=") && !inQuotes) {
            if (current.length > 0) {
                tokens.push({
                    type: getType(current),
                    value: current,
                    line: startLine,
                    column: startColumn
                });
                current = "";
            }
            if (char === "=") {
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

        if (token.type === "keyword" && token.value === "print") {
            if (i+1 < tokens.length) {
                const next = tokens[i+1];
                let value = next.value;

                if (next.type === "string") {
                    value = value.replace(/^"|"$/g, "");
                }

                ast.push({
                    type: "print", 
                    value: value,
                    isLiteral: next.type === "string"
                });
            }
            i+=2;
        }
        else if (token.type === "keyword" && token.value === "let") {
            if (i+3 < tokens.length) {
                const nameToken = tokens[i+1];
                const opToken = tokens[i+2];
                const valueToken = tokens[i+3];

                if (nameToken.type === "identifier" && opToken.value === "=") {
                    let storedValue = valueToken.value;

                    if (valueToken.type === "string") {
                        storedValue = storedValue.replace(/^"|"$/g, "");
                    }

                    ast.push({
                        type: "let",
                        name: nameToken.value,
                        value: storedValue,
                        valueType: valueToken.type
                    });
                }
            }
            i+=4;
        }
        else {
            i++;
        }
    }
    return ast;
}

function execute(ast) {
    const context = {};

    const runtime = {
        print: (node, context) => {
            let value = node.value;

            if (!node.isLiteral && context[value] !== undefined) {
                value = context[value];
            }
            console.log(value);
        },
        let: (node, context) => {
            context[node.name] = node.value;
        }
    };
    for (let node of ast) {
        runtime[node.type]?.(node, context);
        // square brackets allow me to reference a variable when trying to pull a value from an object.
        // the "?." means, only execute this if it exists.
        }
    }

