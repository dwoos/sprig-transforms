import { Project, ts } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "./tsconfig.json",
});

function isTempCall(arg: ts.Expression): boolean {
  return (
    ts.isCallExpression(arg) &&
    ts.isIdentifier(arg.expression) &&
    (arg.expression.text === "tempVec3" ||
      arg.expression.text === "tempVec2" ||
      arg.expression.text === "tempMat4" ||
      arg.expression.text === "tempQuat")
  );
}

type MatrixType = "vec2" | "vec3" | "vec4" | "quat" | "mat4";

interface MatrixTypeIdentifier extends ts.Identifier {
  text: MatrixType;
}

interface MatrixFunctionExpression extends ts.PropertyAccessExpression {
  expression: MatrixTypeIdentifier;
}

interface MatrixCallExpression extends ts.CallExpression {
  expression: MatrixFunctionExpression;
}

function isMatrixCallExpression(node: ts.Node): node is MatrixCallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!ts.isIdentifier(node.expression.expression)) return false;
  return (
    node.expression.expression.text === "vec2" ||
    node.expression.expression.text === "vec3" ||
    node.expression.expression.text === "vec4" ||
    node.expression.expression.text === "quat" ||
    node.expression.expression.text === "mat4"
  );
}

function moveFirstArgumentLast(
  factory: ts.NodeFactory,
  call: MatrixCallExpression
): MatrixCallExpression {
  const ty = call.expression.expression.text;
  const fn = call.expression.name.text;
  if (!flippedArgumentFns[ty].has(fn)) return call;
  console.log(`Flipping arguments of call: ${ty}.${fn}`);
  const firstArg = call.arguments[0];
  const args = call.arguments.slice(1);
  if (!isTempCall(firstArg)) {
    args.push(firstArg);
  }
  return factory.updateCallExpression(
    call,
    call.expression,
    call.typeArguments,
    args
  ) as MatrixCallExpression;
}

function rewriteFunctionName(
  factory: ts.NodeFactory,
  call: MatrixCallExpression
): MatrixCallExpression {
  const ty = call.expression.expression.text;
  const fn = call.expression.name.text;

  const newFnName = rewriteFns[ty].get(fn);
  if (!newFnName) return call;
  console.log(`Rewriting ${ty}.${fn} to ${newFnName}`);

  const newFn = factory.updatePropertyAccessExpression(
    call.expression,
    call.expression.expression,
    factory.createIdentifier(newFnName)
  );

  return factory.updateCallExpression(
    call,
    newFn,
    call.typeArguments,
    call.arguments
  ) as MatrixCallExpression;
}

const flippedArgumentFns: Record<MatrixType, Set<string>> = {
  vec2: new Set([
    "set",
    "add",
    "sub",
    "scale",
    "cross",
    "negate",
    "mul",
    "div",
    "rotate",
    "normalize",
  ]),
  vec3: new Set([
    "set",
    "add",
    "sub",
    "scale",
    "cross",
    "transformMat4",
    "transformQuat",
    "negate",
    "lerp",
    "mul",
    "div",
    "normalize",
  ]),
  vec4: new Set([
    "set",
    "add",
    "sub",
    "scale",
    "cross",
    "transformMat4",
    "transformQuat",
    "negate",
    "lerp",
    "mul",
    "div",
    "normalize",
  ]),
  quat: new Set([
    "add",
    "mul",
    "rotateX",
    "rotateY",
    "rotateZ",
    "slerp",
    "conjugate",
    "normalize",
    "invert",
    "setAxisAngle",
    "getAxisAngle",
    "fromEuler",
  ]),
  mat4: new Set([
    "set",
    "add",
    "mul",
    "ortho",
    "perspective",
    "lookAt",
    "rotateX",
    "rotateY",
    "rotateZ",
    "translate",
    "getScaling",
    "getRotation",
    "getTranslation",
    "fromRotationTranslation",
    "fromRotationTranslationScale",
    "fromRotationTranslationScaleOrigin",
    "fromQuat",
    "fromXRotation",
    "fromYRotation",
    "fromZRotation",
    "fromScaling",
    "invert",
  ]),
};

// prettier-ignore
const rewriteFns: Record<MatrixType, Map<string, string>> = {
  "vec2": new Map([["subtract", "sub"], ["multiply", "mul"], ["len", "length"]]),
  "vec3": new Map([["subtract", "sub"], ["multiply", "mul"], ["len", "length"]]),
  "vec4": new Map([["subtract", "sub"], ["multiply", "mul"], ["len", "length"]]),
  "quat": new Map([["multiply", "mul"]]),
  "mat4": new Map([["multiply", "mul"]])}

const rewriteIdentifiers: Map<string, string> = new Map([
  ["ReadonlyVec2", "vec2"],
  ["ReadonlyVec3", "vec3"],
  ["ReadonlyVec4", "vec3"],
  ["ReadonlyQuat", "quat"],
  ["ReadonlyMat4", "mat4"],
]);

const allFiles = project.getSourceFiles();
allFiles.forEach((f) => {
  // don't transform the actual matrix implementation
  if (f.getBaseName() === "sprig-matrix.ts") return;
  if (f.getBaseName() === "gl-matrix.d.ts") return;
  f.transform((traversal) => {
    let node = traversal.visitChildren();
    //console.log(node)
    if (ts.isImportDeclaration(node)) {
      //console.log(node.moduleSpecifier.getText())
      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text;
      if (modulePath.endsWith("gl-matrix.js")) {
        const newModuleSpecifier = traversal.factory.createStringLiteral(
          modulePath.replace("gl-matrix.js", "sprig-matrix.js")
        );
        const newImports = [
          traversal.factory.createImportSpecifier(
            false,
            undefined,
            traversal.factory.createIdentifier("vec2")
          ),
          traversal.factory.createImportSpecifier(
            false,
            undefined,
            traversal.factory.createIdentifier("vec3")
          ),
          traversal.factory.createImportSpecifier(
            false,
            undefined,
            traversal.factory.createIdentifier("vec4")
          ),
          traversal.factory.createImportSpecifier(
            false,
            undefined,
            traversal.factory.createIdentifier("quat")
          ),
          traversal.factory.createImportSpecifier(
            false,
            undefined,
            traversal.factory.createIdentifier("mat4")
          ),
        ];
        const importClause = traversal.factory.createImportClause(
          false,
          undefined,
          traversal.factory.createNamedImports(newImports)
        );

        node = traversal.factory.updateImportDeclaration(
          node,
          node.decorators,
          node.modifiers,
          importClause,
          newModuleSpecifier,
          node.assertClause
        );
      }
    }
    if (isMatrixCallExpression(node)) {
      let call: MatrixCallExpression = node;
      call = rewriteFunctionName(traversal.factory, call);
      call = moveFirstArgumentLast(traversal.factory, call);
      node = call;
    }
    if (ts.isIdentifier(node)) {
      const replacement = rewriteIdentifiers.get(node.text)!;
      if (replacement) {
        console.log(`Rewriting ${node.text} to ${replacement}`);
        node = traversal.factory.createIdentifier(replacement);
      }
    }
    return node;
  });
});

project.saveSync();

let diagnostics = project.getPreEmitDiagnostics();
console.log(`${diagnostics.length} errors after refactor`);

// Need to look at these diagnostics in reverse order because we're
// changing the files as we go and don't want to mess up line
// numbering!
for (let diagnostic of diagnostics.reverse()) {
  if (
    (diagnostic.getCode() === 2322 ||
      diagnostic.getCode() === 2345 ||
      diagnostic.getCode() === 2740 ||
      diagnostic.getCode() === 2352) &&
    (diagnostic.getMessageText().toString().includes("number") ||
      diagnostic.getMessageText().toString().includes("Float32ArrayOfLength") ||
      diagnostic.getMessageText().toString().includes("vec"))
  ) {
    const sourceFile = diagnostic.getSourceFile();
    if (sourceFile) {
      const diagnosticText = diagnostic.getMessageText().toString();
      if (!diagnostic.compilerObject.start) continue;
      const { line: diagnosticLineNumber } = sourceFile.getLineAndColumnAtPos(
        diagnostic.compilerObject.start
      );
      console.log(
        `Attempting to fix error: ${diagnosticText} at ${sourceFile.getBaseName()}:${diagnosticLineNumber}(${
          diagnostic.compilerObject.start
        })`
      );
      sourceFile.transform((traversal) => {
        let node = traversal.visitChildren();
        let { line } = sourceFile.getLineAndColumnAtPos(
          node.getStart(sourceFile.compilerNode, true)
        );

        if (
          line === diagnosticLineNumber &&
          ts.isArrayLiteralExpression(node) &&
          (!node.parent ||
            !isMatrixCallExpression(node.parent) ||
            node.parent.expression.name.text !== "clone")
        ) {
          if (node.elements.length === 2) {
            console.log(`Found an array on line ${line}, wrapping it`);
            const clone = traversal.factory.createPropertyAccessExpression(
              traversal.factory.createIdentifier("vec2"),
              "clone"
            );
            return traversal.factory.createCallExpression(clone, [], [node]);
          }
          if (node.elements.length === 3) {
            console.log(`Found an array on line ${line}, wrapping it`);
            const clone = traversal.factory.createPropertyAccessExpression(
              traversal.factory.createIdentifier("vec3"),
              "clone"
            );
            return traversal.factory.createCallExpression(clone, [], [node]);
          }
          if (node.elements.length === 4) {
            console.log(`Found an array on line ${line}, wrapping it`);
            const clone = traversal.factory.createPropertyAccessExpression(
              traversal.factory.createIdentifier("vec4"),
              "clone"
            );
            return traversal.factory.createCallExpression(clone, [], [node]);
          }
        }
        return node;
      });
      sourceFile.saveSync();
    }
  }
}

project.saveSync();

diagnostics = project.getPreEmitDiagnostics();
console.log(`${diagnostics.length} errors after autofix`);
