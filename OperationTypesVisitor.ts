import {
  ASTKindToNode, ASTNode, DocumentNode, FieldDefinitionNode, FieldNode, GraphQLSchema, InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode, OperationDefinitionNode, parse, printSchema, TypeNode, Visitor, DefinitionNode
} from 'graphql';
export class OperationTypesVisitorFactory {
  public astNode: DocumentNode;

  constructor(private schema: GraphQLSchema, private config: {
    netKeywords: string[];
    netTypes: { [key: string]: string };
  }) {
    const printedSchema = printSchema(schema); // Returns a string representation of the schema
    this.astNode = parse(printedSchema); // Transforms the string into ASTNode
  }

  public getNetName(name: string) {
    return this.config.netKeywords.includes(name) ? `@${name}` : name;
  }

  public getVisitor(): Visitor<ASTKindToNode, ASTNode> {
    const operationTypesVisitor: Visitor<ASTKindToNode, ASTNode> = {
      enter: {
        Field: (node) => {
          const fields: { [key: string]: FieldDefinitionNode } = {};
          const type = (node as any).schemaType as TypeNode;
          const typeName = this.getGqlTypeName(type);
          let schemaTypes: DefinitionNode[] = [];
          schemaTypes = this.astNode
            .definitions
            .filter((d) => d.kind === 'ObjectTypeDefinition' && d.name.value === typeName)
          if (schemaTypes.length) {
            const schemaType = schemaTypes[0] as ObjectTypeDefinitionNode;
            if (schemaType.fields) {
              schemaType.fields.forEach((f) => {
                fields[f.name.value] = f;
              });
            }
          } else {
            fields.SOMETHING = JSON.stringify(type) as any as FieldDefinitionNode;
          }
          if (node.selectionSet) {
            for (const selection of node.selectionSet.selections) {
              if (selection.kind === 'Field') {
                if (fields[selection.name.value]) {
                  (selection as any).schemaType = fields[selection.name.value].type;
                } else {
                  (selection as any).schemaType = JSON.stringify(fields);
                }
              }
            }
          }
        },
        OperationDefinition: (node) => {
          const ot2 = this.astNode
            .definitions
            .filter((d) =>
              d.kind === 'ObjectTypeDefinition' && d.name.value.toLowerCase() === node.operation.toLowerCase()
            )[0] as ObjectTypeDefinitionNode;
          switch (node.operation) {
            case 'query':
              break;
            case 'mutation':
              break;
            case 'subscription':
              break;
            default:
              throw new Error(`Invalid Operation Type ${node.operation}`);
          }

          if (node.selectionSet) {
            for (const selection of node.selectionSet.selections) {
              switch (selection.kind) {
                case 'Field':
                  (selection as any).schemaType = ot2.fields
                    && ot2.fields.filter((f) => f.name.value === selection.name.value).map((f) => f.type)[0];
                  break;
                default:
              }
            }
          }
        },
      },
      leave: {
        SelectionSet: (node, key, parentGeneric) => {
          const parent = parentGeneric as ASTNode;
          let r = '';
          let className = '';
          //@ts-ignore
          if (parent && parent.operation && parent.kind === 'OperationDefinition') {
            const odNode = (parent as OperationDefinitionNode);
            //@ts-ignore
            className = 'Response';
          } else if (parent && (parent as ASTNode).kind && (parent as ASTNode).kind === 'Field') {
            const fNode = (parent as FieldNode);
            let csType = '';
            const graphQLType = (parent as any).schemaType as TypeNode;
            if (graphQLType) {
              csType = this.getCsTypeName(graphQLType);
              className = this.getCsTypeName(graphQLType, true);
            } else {
              csType = 'unknown';
              className = `${fNode.alias ? fNode.alias.value : fNode.name.value}`;
            }
          } else {
            r += `//NOT SUPPORTED ${parent.kind} { get; set; }\n`;
          }
          r += `\n  public class ${className}`;
          r += '\n  {\n';
          for (const selection of node.selections) {
            switch (selection.kind) {
              case 'Field':
                const graphQLType = (selection as any).schemaType as TypeNode;
                const csType = this.getCsTypeName(graphQLType);
                if (selection.selectionSet) {
                  r += selection.selectionSet;
                  r += `  public ${csType} ${selection.name.value} { get; set; }\n`;
                } else {
                  if (csType && !csType.includes('unknown')) {
                    r += `  public ${csType} ${selection.name.value} { get; set; }\n`;
                  } else {
                    r += `// ${JSON.stringify(graphQLType)}\n`;
                    r += `  public object ${selection.name.value} { get; set; }\n`;
                  }
                }
                break;
              default:
                r += `//NOT SUPPORTED ${selection.kind} { get; set; }\n`;
            }
          }
          r += '\n  }\n';
          return r;
        },
        OperationDefinition: (node) => {
          let r = '';
          if (node.name) {
            const operationClassName = `${node.operation}${node.name.value}`;

            r += `public class ${operationClassName}`;
            r += '\n{\n';
            r += 'public IAppSyncClient AppSyncClient { get; }';
            if (node.selectionSet) {
              r += node.selectionSet;
            }
            // Operation Request Class
            r += 'public class Request';
            r += '\n{\n';
            r += node.variableDefinitions && node.variableDefinitions.join('\n');
            r += '\n}\n';
            // ------------------------
            r += `  public string OperationType { get; } = "${node.operation}";\n`;
            r += `  public string Operation { get; } =  @"${node.loc && node.loc.source.body}";\n`;
            r += `  public ${operationClassName}(IAppSyncClient appSyncClient)\n`;
            r += '\n  {\n';
            r += 'this.AppSyncClient = appSyncClient;';
            r += '\n  }\n';
            r += '  public async Task<Response> Execute(Request request) ';
            r += '\n{';
            r += '  return await this.AppSyncClient.SendRequestAsync<Request, Response>(this.Operation, request).ConfigureAwait(false);';
            r += '\n}';
            r += '\n}\n';
            // Operation IAppSync Extensions
            r += `public static class ${operationClassName}AppSyncClientExtension`;
            r += '\n{\n';
            // tslint:disable-next-line: max-line-length
            r += `public async static Task<${operationClassName}.Response> ${operationClassName}(this IAppSyncClient client, ${operationClassName}.Request request)`;
            r += '\n  {\n';
            r += `  return await new ${operationClassName}(client).Execute(request).ConfigureAwait(false);`;
            r += '\n  }\n';
            r += '\n}\n';
            // -----------------------------
          }
          return r;
        },
        VariableDefinition: (node) => {
          let r = '';
          const typeName = this.getTypeName(node.type);
          const ast = this.getInputTypeObjectDefinition(typeName);
          if (ast) {
            r += this.generateClassForInput(ast);
            r += `public ${ast.name.value} ${node.variable.name.value} { get; set; }`;
          } else {

            r += `public ${this.getCsTypeName(node.type)} ${node.variable.name.value} { get; set; }`;
          }
          return r;
        }
      }
    };

    return operationTypesVisitor;
  }
  
  public getGqlTypeName(type: TypeNode): string {
    switch (type.kind) {
      case 'ListType':
        return this.getGqlTypeName(type.type);
      case 'NamedType':
        return type.name.value;
      case 'NonNullType':
        return this.getGqlTypeName(type.type);
      default:
        return 'unknown5';
    }
  }

  public getInputTypeObjectDefinition(typeName: string) {
    return this
      .astNode
      .definitions
      .filter(
        d => (d.kind === 'InputObjectTypeDefinition') && d.name.value === typeName
      )[0] as InputObjectTypeDefinitionNode;
  }

  public generateClassForInput(ast: InputObjectTypeDefinitionNode) {
    let r = '';
    r += `public class ${ast.name.value}`;
    r += '\n{\n';
    if (ast.fields) {
      for (const field of ast.fields) {
        const ast2 = this.getInputTypeObjectDefinition(this.getTypeName(field.type));
        if (ast2) {
          r += this.generateClassForInput(ast2);
        }
        r += `public ${this.getCsTypeName(field.type)} ${field.name.value} { get; set; }\n`;
      }
    }
    r += '\n}\n';
    return r;
  }

  public getTypeName(type: TypeNode): string {
    if (!type) { return 'unknown2'; }
    switch (type.kind) {
      case 'ListType':
        // return `List<${this.getTypeName(type.type)}>`;
        return this.getCsTypeName(type);
      case 'NamedType':
        return this.getCsTypeName(type);
      case 'NonNullType':
        return this.getTypeName(type.type);
      default:
        return 'unknown1';
    }
  }

  public getCsTypeName(type: TypeNode, baseOnly: boolean = false): string {
    if (!type) { return 'unknown3'; }
    let tn: string;
    switch (type.kind) {
      case 'ListType':
        tn = this.getTypeName(type.type);
        tn = this.config.netTypes[tn] || tn;
        return baseOnly ? tn : `List<${tn}>`;
      case 'NamedType':
        tn = type.name.value;
        return this.config.netTypes[tn] || tn;
      case 'NonNullType':
        tn = this.getTypeName(type.type);
        return `${this.config.netTypes[tn] || (tn)}`;
      default:
        return 'unknown4';
    }
  }
}
