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

    this.buildIndexes();

    return ref;
  }

  addDocs(docs: IFakeCouch.Document[]): void {
    docs.forEach((doc) => this._addDoc(doc));
    this.buildIndexes();
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

    this.indexes[doc._id] = () => {
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

    this.indexes[doc._id]();

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
    const paths = Object.keys(selector);
    const result: QueryResponse = {
      docs: []
    };

    result.docs = items.filter((item) => paths.every((path) => {
      const fieldValue: any = dotProp.get(item, path);
      const selectorValue = selector[path];

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
        }

        throw new Error('Invalid operator');
      });
    }));

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
