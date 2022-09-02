import { Project, ts, } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "../tsconfig.json",
});

function isTempCall(arg: ts.Expression): boolean {
  return (arg.getText() === "tempVec3()" || arg.getText() === "tempVec2()" || arg.getText() === "tempMat4()" || arg.getText() === "tempQuat()")
}

function moveFirstArgumentLast(factory: ts.NodeFactory, node: ts.CallExpression) {
  const firstArg = node.arguments[0];
  const args = node.arguments.slice(1)
  if (!isTempCall(firstArg)) {
    args.push(firstArg);
  }
  return factory.updateCallExpression(node, node.expression, node.typeArguments, args);

}

const diagnostics = project.getPreEmitDiagnostics();

const allFiles = project.getSourceFiles();
allFiles.forEach(f => f.transform(traversal => {
  const node = traversal.visitChildren();
  //console.log(node)
  if (ts.isImportDeclaration(node)) {
    //console.log(node.moduleSpecifier.getText())
    const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
    if (modulePath.endsWith("gl-matrix.js")) {
      const newModuleSpecifier = traversal.factory.createStringLiteral(modulePath.replace("gl-matrix.js", "sprig-matrix.js"));
      return traversal.factory.updateImportDeclaration(node, node.decorators, node.modifiers, node.importClause, newModuleSpecifier, node.assertClause);
    }
  }
  if (ts.isCallExpression(node)) {
    if (node.expression.getText() === "vec3.add") {
      return moveFirstArgumentLast(traversal.factory, node);
    }
    if (node.expression.getText() === "vec3.sub") {
      return moveFirstArgumentLast(traversal.factory, node);
    }
    if (node.expression.getText() === "vec3.scale") {
      return moveFirstArgumentLast(traversal.factory, node);
    }
    
  }
  return node
}))

project.saveSync()
