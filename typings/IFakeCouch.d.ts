import express from 'express';

export namespace IFakeCouch {
  export type Options = {
    port?: number;
    logger?: boolean;
  };

  export type Headers = Record<string, string>;
  export type Request = express.Request & { query: Record<string, any>, body: Record<string, any> };
  export type ReplyFunctionReturns = [number] | [number, any] | [number, any, Headers];
  export type ReplyFunction = (req: Request) => ReplyFunctionReturns;
  export type Scope = {
    head: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
    get: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
    post: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
    put: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
    delete: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
    copy: (path: any, code: ReplyFunction | [Function, ReplyFunction] | number, body?: any, headers?: Headers) => Scope;
  };

  export type Document = {
    _id?: string;
    [key: string]: any;
  };

  export type DocumentRef = Required<Document> & {
    _rev: string;
  }

  export interface Database {
    readonly name: string;
    readonly docs: Record<string, DocumentRef>;
    readonly localDocs: Record<string, DocumentRef>;
    readonly designs: Record<string, DocumentRef>;

    addDoc(doc: Document, docid?: string): DocumentRef;
    addDocs(docs: Document[]): void;
    addDesign(ddoc: Required<Document>): DocumentRef;
    hasDesign(ddocid: string): boolean;
    deleteDesign(ddocid: string): void;
  }

  export interface Server {
    readonly serveUrl: string;
    readonly serverPort: number;
    readonly databases: Record<string, Database>;

    setup(): void;
    reset(): void;
    addDatabase(dbname: string): Database;
  }
}
