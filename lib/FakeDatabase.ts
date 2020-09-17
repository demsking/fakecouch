/* eslint-disable no-eval */
/* eslint-disable camelcase */

import * as dotProp from 'dot-prop';
import { v4 as uuid } from 'uuid';
import { IFakeCouch } from '../typings/IFakeCouch';

const equal = require('deep-equal');

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
  selector: IFakeCouch.Selector;
  execution_stats?: boolean;
  sort?: Record<string, 'asc' | 'desc'>[];
}

interface QueryResponse {
  docs: IFakeCouch.DocumentRef[];
  execution_stats?: {
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

function getCouchType(value: unknown) {
  if (value instanceof Array) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value;
}

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
  readonly designIndexes: Record<string, Function> = {};
  readonly indexes: IFakeCouch.IndexDefinition[] = [
    {
      ddoc: null,
      name: '_all_docs',
      type: 'special',
      def: {
        fields: [
          {
            _id: 'asc'
          }
        ]
      }
    }
  ];

  readonly security: Record<'admins' | 'members', IFakeCouch.SecurityObject> = {
    admins: {
      names: [],
      roles: [
        '_admin'
      ]
    },
    members: {
      names: [],
      roles: [
        '_admin'
      ]
    }
  };

  constructor(name: string) {
    this.name = name;
    this.info.db_name = name;
  }

  static parseDesignViewItems(items: LocalViewItem[], request: FindByViewRequest = {}, view?: LocalView): any {
    const skip = Number.parseInt(`${request.skip}`, 10) || 0;
    const limit = Number.parseInt(`${request.limit}`, 10) || 20;

    if (request.hasOwnProperty('descending')) {
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
    }

    items = items.slice(skip, skip + limit);

    if (view && view.reducer) {
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
      offset: skip,
      total_rows: items.length,
      rows: request.include_docs
        ? items
        : items.map(({ id, key, value }) => ({ id, key, value }))
    };
  }

  _addDoc(body: Record<string, any>, docid?: string): IFakeCouch.DocumentRef {
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

    return doc as any;
  }

  addDoc(doc: IFakeCouch.Document, docid?: string): IFakeCouch.DocumentRef {
    const ref = this._addDoc(doc, docid);

    this.buildDesignIndexes();

    return ref;
  }

  addDocs(docs: IFakeCouch.Document[]): void {
    docs.forEach((doc) => this._addDoc(doc));
    this.buildDesignIndexes();
  }

  addIndex(index: IFakeCouch.Index): IFakeCouch.IndexDefinition {
    const indexDefinition: IFakeCouch.IndexDefinition = {
      ddoc: `_design/${index.ddoc || uuid()}`,
      name: index.name || uuid(),
      type: index.type || 'json',
      def: {
        fields: index.index.fields.map((item) => {
          return typeof item === 'string' ? { [item]: 'asc' } : item;
        }),
        partial_filter_selector: index.index.partial_filter_selector
      }
    };

    this.indexes.push(indexDefinition);

    return indexDefinition;
  }

  deleteIndex(ddoc: string, indexName: string): boolean {
    const pos = this.indexes.findIndex((index) => index.ddoc === ddoc && index.name === indexName);

    if (pos > -1) {
      this.indexes.splice(pos, 1);

      return true;
    }

    return false;
  }

  addDesign(ddoc: IFakeCouch.DesignDocument): IFakeCouch.DocumentRef {
    const doc = ddoc as Required<IFakeCouch.Document>;

    doc._rev = `1-${uuid()}`;

    this.designs[doc._id] = doc as any;
    this.storage[doc._id] = {};

    const views = this.storage[doc._id];

    for (const name in doc.views) {
      views[name] = {
        items: [],
        mapper: eval(doc.views[name].map),
        reduce: 0,
        reducer: doc.views[name].reduce
      };
    }

    function resetViews() {
      for (const name in doc.views) {
        views[name].items.splice(0);

        views[name].reduce = 0;
      }
    }

    this.designIndexes[doc._id] = () => {
      resetViews();

      const rows = Object.values(this.docs);

      for (const name in doc.views) {
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

    this.designIndexes[doc._id]();

    return doc as any;
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
      const items: Row[] = view.items.slice(0) as any;

      return FakeDatabase.parseDesignViewItems(items, request, view);
    }

    return null;
  }

  buildDesignIndexes(): void {
    for (const id in this.designIndexes) {
      this.designIndexes[id]();
    }
  }

  deleteDesign(ddocid: string): void {
    delete this.storage[ddocid];
    delete this.designs[ddocid];
    delete this.designIndexes[ddocid];
  }

  _findFilter(fieldValue: any, selectorValue: any): boolean {
    if (typeof selectorValue !== 'object') {
      return fieldValue === selectorValue;
    }

    if (selectorValue === null) {
      return fieldValue === null;
    }

    if (selectorValue instanceof Array) {
      return fieldValue instanceof Array
        && selectorValue.length === fieldValue.length
        && fieldValue.every((item, index) => equal(item, selectorValue[index]));
    }

    return Object.keys(selectorValue).every((operator) => {
      const operatorValue = selectorValue[operator];

      switch (operator) {
        case '$eq':
          return equal(fieldValue, operatorValue);

        case '$ne':
          return !equal(fieldValue, operatorValue);

        case '$lt':
          return fieldValue < operatorValue;

        case '$gt':
          return fieldValue > operatorValue;

        case '$lte':
          return fieldValue <= operatorValue;

        case '$gte':
          return fieldValue >= operatorValue;

        case '$exists':
          return operatorValue
            ? typeof fieldValue !== 'undefined'
            : typeof fieldValue === 'undefined';

        case '$type':
          return getCouchType(fieldValue) === operatorValue;

        case '$in':
          return fieldValue instanceof Array
            && operatorValue instanceof Array
            && operatorValue.some((item) => fieldValue.includes(item));

        case '$nin':
          return fieldValue instanceof Array
            && operatorValue instanceof Array
            && operatorValue.some((item) => !fieldValue.includes(item));

        case '$size':
          return fieldValue instanceof Array && fieldValue.length === operatorValue;

        case '$mod': {
          const [divisor, remainder] = operatorValue;

          if (typeof divisor !== 'number' || typeof remainder !== 'number') {
            return false;
          }

          return fieldValue % divisor === remainder;
        }

        case '$regex':
          return new RegExp(operatorValue).test(`${fieldValue}`);

        case '$all':
          if (!Array.isArray(operatorValue) && operatorValue !== null) {
            throw Error('Invalid $all value');
          }

          return operatorValue.includes(fieldValue);

        case '$elemMatch':
          return fieldValue instanceof Array
            && fieldValue.some((fieldItem) => this._findFilter(fieldItem, operatorValue));

        case '$allMatch':
          return fieldValue instanceof Array
            && fieldValue.every((fieldItem) => this._findFilter(fieldItem, operatorValue));

        case '$keyMapMatch':
          return typeof fieldValue === 'object'
            && !Array.isArray(fieldValue)
            && fieldValue !== null
            && Object.keys(fieldValue).some((fieldKey) => this._findFilter(fieldKey, operatorValue));
      }

      throw new Error('Invalid operator');
    });
  }

  _find(selector: IFakeCouch.Selector, items: IFakeCouch.DocumentRef[]): IFakeCouch.DocumentRef[] {
    const paths = Object.keys(selector);

    return items.filter((item) => paths.every((path) => {
      const fieldValue: any = dotProp.get(item, path);
      const selectorValue = selector[path];

      return this._findFilter(fieldValue, selectorValue);
    }));
  }

  find(request: QueryRequest): QueryResponse {
    const {
      selector,
      limit = 25,
      skip = 0,
      fields = [],
      sort = [],
      execution_stats = false
    } = request;

    const startTime = process.hrtime();
    const items = Object.values(this.docs);
    const result: QueryResponse = {
      docs: items
    };

    Object.keys(selector).forEach((key) => {
      const selectorValue = selector[key];

      switch (key) {
        case '$and':
          if (!Array.isArray(selectorValue)) {
            throw Error('Invalid $and value');
          }

          result.docs = items;

          selectorValue.forEach((itemSelector) => {
            result.docs = this._find(itemSelector, result.docs);
          });
          break;

        case '$or':
          if (!Array.isArray(selectorValue)) {
            throw Error('Invalid $or value');
          }

          result.docs = [];

          selectorValue.forEach((itemSelector) => {
            this._find(itemSelector, items).forEach((item) => {
              if (!result.docs.includes(item)) {
                result.docs.push(item);
              }
            });
          });
          break;

        case '$not': {
          if (Array.isArray(selectorValue)) {
            throw Error('Invalid $not value');
          }

          const notResult = this._find(selectorValue, result.docs);

          result.docs = result.docs.filter((item) => !notResult.includes(item));
          break;
        }

        case '$nor':
          if (!Array.isArray(selectorValue)) {
            throw Error('Invalid $nor value');
          }

          selectorValue.forEach((itemSelector) => {
            const norResult = this._find(itemSelector, result.docs);

            result.docs = result.docs.filter((item) => !norResult.includes(item));
          });
          break;

        default:
          result.docs = this._find({ [key]: selectorValue }, result.docs);
      }
    });

    if (sort.length) {
      sort.forEach((sortItem) => {
        if (typeof sortItem === 'string') {
          sortItem = {
            [sortItem]: 'asc'
          };
        }

        for (const sortFieldPath in sortItem) {
          const sortType = sortItem[sortFieldPath];

          if (sortType === 'asc') {
            result.docs.sort((a, b) => {
              const fieldAValue: any = dotProp.get(a, sortFieldPath);
              const fieldBValue: any = dotProp.get(b, sortFieldPath);

              return `${fieldAValue}`.localeCompare(`${fieldBValue}`);
            });
          } else {
            result.docs.sort((a, b) => {
              const fieldAValue: any = dotProp.get(a, sortFieldPath);
              const fieldBValue: any = dotProp.get(b, sortFieldPath);

              return `${fieldBValue}`.localeCompare(`${fieldAValue}`);
            });
          }

          break;
        }
      });
    }

    result.docs = result.docs.slice(skip, skip + limit);

    if (fields.length) {
      result.docs = result.docs.map((item) => {
        const outItem = {} as any;

        fields.forEach((path) => dotProp.set(outItem, path, dotProp.get(item, path)));

        return outItem;
      });
    }

    if (execution_stats) {
      result.execution_stats = {
        total_keys_examined: 0,
        total_docs_examined: items.length,
        total_quorum_docs_examined: 0,
        results_returned: result.docs.length,
        execution_time_ms: process.hrtime(startTime)[1] / 1000000
      };
    }

    return result;
  }
}
