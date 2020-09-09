/* eslint-disable no-eval */
/* eslint-disable camelcase */

import * as dotProp from 'dot-prop';
import { v4 as uuid } from 'uuid';
import { IFakeCouch } from '../typings/IFakeCouch';

type LocalView = {
  items: LocalViewItem[];
  mapper: Function;
  reduce: number;
  reducer: '_count' | '_sum';
};

type LocalViewItem = {
  id: any;
  key: any;
  value: any;
  doc?: IFakeCouch.DocumentRef;
};

interface Selector extends CombinationOperators {
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

interface GenericRequest {
  /**
   * Defines a list of fields that you want to receive.
   * If omitted, you get the full documents.
   */
  fields?: string[];

  /**
   * Defines a list of fields defining how you want to sort.
   * Note that sorted fields also have to be selected in the selector.
   */
  sort?: Array<string | { [field: string]: 'asc' | 'desc' }>;

  /** Maximum number of documents to return. */
  limit?: number;

  /** Number of docs to skip before returning. */
  skip?: number;
}

interface QueryRequest extends GenericRequest {
  /** Defines a selector to filter the results. Required */
  selector: Selector;
}

interface QueryResponse {
  docs: any[];
  execution_stats: {
    total_keys_examined: number;
    total_docs_examined: number;
    total_quorum_docs_examined: number;
    results_returned: number;
    execution_time_ms: number;
  };
}

interface FindByViewRequest extends GenericRequest {
  // eslint-disable-next-line camelcase
  include_docs?: boolean;
  descending?: boolean;
  group?: boolean;
  skip?: number;
  key?: string;
}

type Row = {
  id: string;
  key: any;
  value: any;
  doc: IFakeCouch.DocumentRef;
};

export default class FakeDatabase implements IFakeCouch.Database {
  readonly name: string;
  readonly info = {
    db_name: 'fake',
    update_seq: '52232',
    sizes: {
      file: 1178613587,
      external: 1713103872,
      active: 1162451555
    },
    purge_seq: 0,
    doc_del_count: 0,
    doc_count: 0,
    disk_format_version: 6,
    compact_running: false,
    cluster: {
      q: 1,
      n: 1,
      w: 1,
      r: 1
    },
    instance_start_time: '0'
  };

  readonly docs: Record<string, IFakeCouch.DocumentRef> = {};
  readonly localDocs: Record<string, IFakeCouch.DocumentRef> = {};
  readonly designs: Record<string, IFakeCouch.DocumentRef> = {};
  readonly storage: Record<string, Record<string, LocalView>> = {};
  readonly indexes: Record<string, Function> = {};

  readonly security: Record<string, any> = {
    admins: {
      names: [],
      roles: []
    },
    members: {
      names: [],
      roles: []
    }
  };

  constructor(name: string) {
    this.name = name;
    this.info.db_name = name;
  }

  _addDoc(body: Record<string, any>, docid?: string): any {
    const doc = { ...body };

    if (!doc._id) {
      doc._id = docid || uuid();
    }

    if (doc._id.startsWith('_local/')) {
      doc._rev = '1-1';

      this.localDocs[doc._id] = doc as any;
    } else {
      doc._rev = `1-${uuid()}`;
      this.docs[doc._id] = doc as any;

      if (doc._deleted) {
        this.info.doc_del_count++;
      } else {
        this.info.doc_count++;
      }
    }

    return doc;
  }

  addDoc(doc: IFakeCouch.Document, docid?: string): IFakeCouch.DocumentRef {
    const ref = this._addDoc(doc, docid);

    this.buildIndexes();

    return ref;
  }

  addDocs(docs: IFakeCouch.Document[]): void {
    docs.forEach((doc) => this._addDoc(doc));
    this.buildIndexes();
  }

  addDesign(ddoc: Required<IFakeCouch.Document>): IFakeCouch.DocumentRef {
    ddoc._rev = `1-${uuid()}`;

    this.designs[ddoc._id] = ddoc as any;
    this.storage[ddoc._id] = {};

    const views = this.storage[ddoc._id];

    for (const name in ddoc.views) {
      views[name] = {
        items: [],
        mapper: eval(ddoc.views[name].map),
        reduce: 0,
        reducer: ddoc.views[name].reduce
      };
    }

    function resetViews() {
      for (const name in ddoc.views) {
        views[name].items.splice(0);

        views[name].reduce = 0;
      }
    }

    this.indexes[ddoc._id] = () => {
      resetViews();

      const rows = Object.values(this.docs);

      for (const name in ddoc.views) {
        const view = views[name];

        rows.forEach((doc) => {
          (global as any).emit = (key: any, value: any) => {
            view.items.push({ id: doc._id, key, value, doc });

            if (view.reducer === '_sum') {
              view.reduce += Number.parseInt(value, 10) || 0;
            }

            return false;
          };

          view.mapper(doc);

          if (view.reducer === '_count') {
            view.reduce = view.items.length;
          }
        });
      }
    };

    this.indexes[ddoc._id]();

    return ddoc as any;
  }

  hasDesign(ddocid: string): boolean {
    return this.designs.hasOwnProperty(ddocid);
  }

  hasDesignView(ddocid: string, viewname: string): boolean {
    return this.designs.hasOwnProperty(ddocid) && this.storage[ddocid].hasOwnProperty(viewname);
  }

  getDesignView(ddocid: string, viewname: string, request: FindByViewRequest = {}): any {
    if (this.designs.hasOwnProperty(ddocid)) {
      const views = this.storage[ddocid];
      const view = views[viewname];
      let items: Row[] = view.items.slice(0) as any;

      if (request.descending) {
        items.sort((a, b) => {
          if (typeof b.key === 'string') {
            return b.key.localeCompare(a.key);
          }

          return b.key - a.key;
        });
      } else {
        items.sort((a, b) => {
          if (typeof a.key === 'string') {
            return a.key.localeCompare(b.key);
          }

          return a.key - b.key;
        });
      }

      if (request.skip) {
        items = items.slice(request.skip);
      }

      if (view.reducer) {
        if (request.group) {
          const groups: Record<string, any> = {};

          switch (view.reducer) {
            case '_sum':
              view.items.forEach(({ key, value }) => {
                if (groups.hasOwnProperty(key)) {
                  groups[key] += value;
                } else {
                  groups[key] = { key, value: value || 0 };
                }
              });
              break;

            case '_count':
              view.items.forEach(({ key }) => {
                if (groups.hasOwnProperty(key)) {
                  groups[key]++;
                } else {
                  groups[key] = { key, value: 0 };
                }
              });
              break;
          }

          return { rows: Object.values(groups) };
        }

        return {
          rows: [
            { key: null, value: view.reduce }
          ]
        };
      }

      return {
        offset: request.skip || 0,
        total_rows: items.length,
        rows: request.include_docs
          ? items
          : items.map(({ id, key, value }) => ({ id, key, value }))
      };
    }

    return null;
  }

  buildIndexes(): void {
    for (const id in this.indexes) {
      this.indexes[id]();
    }
  }

  deleteDesign(ddocid: string): void {
    delete this.storage[ddocid];
    delete this.designs[ddocid];
    delete this.indexes[ddocid];
  }

  find({ selector, limit = 25, skip = 0, fields = [] }: QueryRequest): QueryResponse {
    const items = Object.values(this.docs);
    const paths = Object.keys(selector);
    let docs: any[] = items
      .filter((item) => {
        return paths.every((path) => {
          const fieldValue = dotProp.get(item, path);
          const selectorValue = selector[path];

          if (typeof selectorValue !== 'object') {
            return fieldValue === selectorValue;
          } if (selectorValue === null) {
            return selectorValue === null;
          } if (!Array.isArray(selectorValue)) {
            for (const operator in selectorValue) {
              const operatorValue = selectorValue[operator];

              switch (operator) {
                case '$regex': {
                  return new RegExp(operatorValue).test(`${fieldValue}`);
                }
              }
            }
          }

          return false;
        });
      })
      .slice(skip, skip + limit);

    if (fields.length) {
      docs = docs.map((item) => {
        const outItem = {};

        fields.forEach((path) => dotProp.set(outItem, path, dotProp.get(item, path)));

        return outItem;
      });
    }

    return {
      docs,
      execution_stats: {
        total_keys_examined: 0,
        total_docs_examined: items.length,
        total_quorum_docs_examined: 0,
        results_returned: docs.length,
        execution_time_ms: 5.52
      }
    };
  }
}
