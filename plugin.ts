import { ASTKindToNode, ASTNode, DocumentNode, GraphQLSchema, parse, printSchema, visit, Visitor } from 'graphql';
import { OperationTypesVisitorFactory } from './OperationTypesVisitor';
import { default as SchemaTypesVisitor } from './SchemaTypesVisitor';
module.exports = {
  plugin: (
    schema: GraphQLSchema,
    documents: Array<{ filePath: string; content: DocumentNode }>,
    config: {
      netKeywords: string[];
      netTypes: { [key: string]: string };
    }) => {
    config.netKeywords = config.netKeywords || ['case', 'private', 'public'];
    const getNetName = (name: string) => config.netKeywords.includes(name) ? `@${name}` : name;
    config.netTypes = config.netTypes || {
      'String': 'string',
      'String!': 'string',
      '[string]' : 'List<string>',
      '[string]!' : 'List<string>',
      'AWSDateTime': 'DateTime?',
      'AWSDateTime!': 'DateTime',
      'Int': 'int?',
      'Int!': 'int',
      'Boolean': 'bool?',
      'Boolean!': 'bool',
      'Float': 'float?',
      'Float!': 'float'
    };

    const printedSchema = printSchema(schema); // Returns a string representation of the schema
    const astNode = parse(printedSchema); // Transforms the string into ASTNode
    const definitions = [];
    // const result = visit(astNode, SchemaTypesVisitor);
    // definitions.push(...result.definitions);

    for (const document of documents) {
      const r2 = visit(document.content, new OperationTypesVisitorFactory(schema, config).getVisitor());
      definitions.push(...r2.definitions);
    }

    let r = '';
    r += `using System;
    using System.Collections.Generic;
    using System.Threading.Tasks;`;
    r += 'namespace AppSync.Operations';
    r += '\n{\n';
    r += `public interface IAppSyncClient
    {
        Task<TRes> SendRequestAsync<TVar, TRes>(string query, TVar variables);
    }`;
    r += definitions.join('\n');
    r += '\n}\n';
    return r;
  },
};
