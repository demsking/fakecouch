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

  interface ConditionOperators {
    /** Match fields 'less than' this one. */
    $lt?: any;

    /** Match fields 'greater than' this one. */
    $gt?: any;

    /** Match fields 'less than or equal to' this one. */
    $lte?: any;

    /** Match fields 'greater than or equal to' this one. */
    $gte?: any;

    /** Match fields equal to this one. */
    $eq?: any;

    /** Match fields not equal to this one. */
    $ne?: any;

    /** True if the field should exist, false otherwise. */
    $exists?: boolean;

    /** One of: 'null', 'boolean', 'number', 'string', 'array', or 'object'. */
    $type?: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

    /** The document field must exist in the list provided. */
    $in?: any[];

    /** The document field must not exist in the list provided. */
    $nin?: any[];

    /**
     * Special condition to match the length of an array field in a document.
     * Non-array fields cannot match this condition.
     */
    $size?: number;

    /**
     * Divisor and Remainder are both positive or negative integers.
     * Non-integer values result in a 404 status.
     * Matches documents where (field % Divisor == Remainder) is true,
     * and only when the document field is an integer.
     * [divisor, remainder]
     */
    $mod?: [number, number];

    /**
     * A regular expression pattern to match against the document field.
     * Only matches when the field is a string value and matches the supplied
     * regular expression.
     */
    $regex?: string;

    /** Matches an array value if it contains all the elements of the argument array. */
    $all?: any[];

    $elemMatch?: ConditionOperators;
  }

  export interface Selector extends CombinationOperators {
    [field: string]: Selector | Selector[] | ConditionOperators | any;
  }

  interface CombinationOperators {
    /** Matches if all the selectors in the array match. */
    $and?: Selector[];

    /** Matches if any of the selectors in the array match. All selectors must use the same index. */
    $or?: Selector[];

    /** Matches if the given selector does not match. */
    $not?: Selector;

    /** Matches if none of the selectors in the array match. */
    $nor?: Selector[];
  }

  export type Index = {
    index: {
      fields: (string | Record<string, 'asc' | 'desc'>)[];
      partial_filter_selector?: Selector;
    };
    ddoc?: string;
    name?: string;
    type?: 'json' | 'text';
    partial_filter_selector?: Record<string, any>;
    partitioned: boolean;
  };

  export type IndexDefinition = {
    ddoc: string | null;
    name: string;
    type: 'special' | 'json' | 'text';
    partitioned?: boolean;
    def: {
      fields: (string | Record<string, 'asc' | 'desc'>)[];
      partial_filter_selector?: Selector;
    };
  };

  export interface Database {
    readonly name: string;
    readonly docs: Record<string, DocumentRef>;
    readonly localDocs: Record<string, DocumentRef>;
    readonly designs: Record<string, DocumentRef>;

    addDoc(doc: Document, docid?: string): DocumentRef;
    addDocs(docs: Document[]): void;
    addIndex(index: Index): IndexDefinition;
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
