import express, { Response } from 'express';

export namespace IFakeCouch {
  export type Options = {
    port?: number;
    logger?: boolean;
  };

  export type Headers = Record<string, string>;
  export type Request = express.Request & { query: Record<string, any>, body: Record<string, any> };
  export type ReplyFunctionReturns = [number] | [number, any] | [number, any, Headers];
  export type ReplyFunction = (req: Request) => ReplyFunctionReturns;
  export type MiddlewareFunction = (req: Request, res: Response) => void;

  export type PrimitiveHandler = {
    auth?: boolean;
    status: number;
    body?: any;
    headers?: Headers;
  };

  export type FunctionHandler = ReplyFunction | [Function, MiddlewareFunction];

  export type Handler = PrimitiveHandler | FunctionHandler;

  export type Scope = {
    head: (path: any, handler: Handler) => Scope;
    get: (path: any, handler: Handler) => Scope;
    post: (path: any, handler: Handler) => Scope;
    put: (path: any, handler: Handler) => Scope;
    delete: (path: any, handler: Handler) => Scope;
  };

  export type Document = {
    _id?: string;
    [key: string]: any;
  };

  export type DocumentRef = Required<Document> & {
    _rev: string;
  }

  export type DesignDocument = {
    _id: string;
    views: {
      [viewname: string]: {
        map: string;
        reduce?: string;
      };
    };
  };

  export interface Database {
    readonly name: string;
    readonly docs: Record<string, DocumentRef>;
    readonly localDocs: Record<string, DocumentRef>;
    readonly designs: Record<string, DocumentRef>;

    addDoc(doc: Document, docid?: string): DocumentRef;
    addDocs(docs: Document[]): void;
    addDesign(ddoc: IFakeCouch.DesignDocument): DocumentRef;
    hasDesign(ddocid: string): boolean;
    deleteDesign(ddocid: string): void;
  }

  export interface Server {
    readonly serveUrl: string;
    readonly serverPort: number;
    readonly databases: Record<string, Database>;

    setup(): void;
    reset(): void;
    authenticate(): void;
    addDatabase(dbname: string): Database;
  }
}
