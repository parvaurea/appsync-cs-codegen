import { Visitor, ASTKindToNode, ASTNode } from "graphql";
const config: {
  netKeywords: string[];
  netTypes: { [key: string]: string };
} = {
  netKeywords: ['case', 'private', 'public'],
  netTypes: {
    'String': 'string?',
    'String!': 'string',
    'AWSDateTime': 'DateTime',
    'Int': 'int?',
    'Int!': 'int',
    'Boolean': 'bool?',
    'Boolean!': 'bool'
  }
}
const getNetName = (name: string) => config.netKeywords.includes(name) ? `@${name}` : name;
const SchemaTypesVisitor: Visitor<ASTKindToNode, ASTNode> = {
  leave: {
    ObjectField: (field) => {
      return `public ${field.value.kind} ${getNetName(field.name as any as string)} { get; set; }`;
    },
    // Field: (field) => {
    //   return `public ${field.name.value} { get; set; }`;
    // },
    NamedType: (type) => {
      return `${config.netTypes[type.name.value] || type.name.value}`;
    },
    ListType: (type) => {
      return `List<${type.type}>`;
    },
    NonNullType: (type) => {
      switch (type.type.kind) {
        case 'NamedType':
          return `${config.netTypes[type.type as any as string] || type.type}`;
          break;
        case 'ListType':
          return `List<${type.type}>`;
          break;
        default:
          return type.type;
      }
    },
    FloatValue: (val) => {
      return `float ${val.value}`;
    },
    IntValue: (val) => {
      return `int ${val.value}`;
    },
    BooleanValue: (val) => {
      return `bool ${val.value}`;
    },
    // Argument: (arg)=>{
    // },
    FieldDefinition: (field) => {
      let r = 'public';
      switch (field.type.kind) {
        case 'ListType':
          r += ` List<${field.type.type}>`;
          break;
        case 'NamedType':
          r += ` ${config.netTypes[field.type.name.value] || field.type.name.value}`;
          break;
        case 'NonNullType':
          r += ` ${field.type.type}`;
          break;
        default:
          r += ` ${field.type}`;
      }
      r += ` ${getNetName(field.name.value)}`;
      if (field.arguments && field.arguments.length) {
        r += `(${field.arguments.map((a) => `${a.type.kind || a.type} ${a.name.value}`).join(', ')})`;
        r += '\n  {\n';
        r += '    // call appsync client';
        r += '\n  }\n';
      } else {
        r += ' { get; set; }';
      }
      return r;
    },
    ObjectTypeDefinition: (node) => {
      let r = '';
      r += `public class ${getNetName(node.name.value)}`;
      r += '\n{';
      if (node.fields) {
        for (const field of node.fields) {
          r += `\n  ${field}`;
        }
      }
      r += '\n}';
      return r;
    },
    InputObjectTypeDefinition: (node) => {
      let r = '';
      // r += '/**\n';
      // r += `Input Type ${node.name.value}\n`;
      // r += '**/\n';
      r += `public class ${getNetName(node.name.value)}`;
      r += '\n{';
      if (node.fields) {
        for (const field of node.fields) {
          r += `\n  ${field.type} ${getNetName(field.name.value)} { get; set; }`;
        }
      }
      r += '\n}';
      return r;
    },
    // InputValueDefinition: (node) => {
    //   return 'INPUT VALUE';
    // },
    ScalarTypeDefinition: (node) => {
      return `// skipped scalar ${node.name.value}`;
    },
    OperationDefinition: (node) => {
      let r = '';
      if (node.name) {
        if (node.selectionSet) {
          r += `public class ${node.operation}${node.name.value}Response`;
          r += '\n{\n';
          for (const selection of node.selectionSet.selections) {
            r += `  public`;
            switch (selection.kind) {
              case 'Field':
                r += ` ${selection.name.value} ${selection.name.value} { get; set; }`;
                break;
              default:
                r += `//NOT SUPPORTED ${selection.kind} { get; set; }`;
            }
          }
          r += '\n}\n';
        }
        r += `public class ${node.operation}${node.name.value}`;
        r += '\n{\n';
        r += `  public ${node.operation}${node.name.value}(IAppSyncClient appSyncClient)`;
        r += '\n  {\n';
        r += '\n  }\n';
        r += `  public ${node.operation}${node.name.value}Response Execute`;
        r += '(';
        if (node.variableDefinitions) {
          r += node.variableDefinitions.join(' ');
        }
        r += ')';
        r += '\n  {\n';
        r += '\n  }\n';
        r += '\n}\n';
      }
      return r;
    },
    FragmentDefinition: (node) => {
      return `FRAGMENT ${node.name} ${node.typeCondition.name.value}`;
    },
    // SelectionSet: (node) => {
    //   return `${node.kind}`;
    // },
    OperationTypeDefinition: (node) => {
      return `OPERATION TYPE ${node.type} ${node.operation}`;
    },
    VariableDefinition: (node) => {
      return `${node.type} ${node.variable.name.value}`;
    },
    SchemaDefinition: (node) => {
      return `SCHEMA ${node.kind} ${node.operationTypes}`;
    },
    // Document: (node) => {
    //   return `DOCUMENT ${node.kind}`;
    // }
  }
};

module.exports = SchemaTypesVisitor;
