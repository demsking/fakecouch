import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { v4 as uuid } from 'uuid';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59843,
  logger: false
});

const api = supertest(couch.serveUrl);

describe('Database', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('HEAD /{db}', () => {
    const dbname = uuid();

    return api.head(`/${dbname}`).expect(404)
      .then(() => couch.addDatabase(dbname))
      .then(() => api.head(`/${dbname}`).expect(200));
  });

  it('GET /{db}', () => {
    const dbname = uuid();

    return api.get(`/${dbname}`).expect(404)
      .then(() => couch.addDatabase(dbname))
      .then(() => api.get(`/${dbname}`).expect(200))
      .then(({ body: info }) => {
        expect(info).toBeInstanceOf(Object);
        expect(Object.keys(info)).toEqual([
          'db_name',
          'update_seq',
          'sizes',
          'purge_seq',
          'doc_del_count',
          'doc_count',
          'disk_format_version',
          'compact_running',
          'cluster',
          'instance_start_time',
        ]);
        expect(info.db_name).toBe(dbname);
        expect(typeof info.update_seq).toBe('string');
        expect(typeof info.sizes).toBe('object');
        expect(typeof info.sizes.file).toBe('number');
        expect(typeof info.sizes.external).toBe('number');
        expect(typeof info.sizes.active).toBe('number');
        expect(typeof info.purge_seq).toBe('number');
        expect(typeof info.doc_del_count).toBe('number');
        expect(typeof info.doc_count).toBe('number');
        expect(typeof info.disk_format_version).toBe('number');
        expect(typeof info.compact_running).toBe('boolean');
        expect(typeof info.cluster).toBe('object');
        expect(typeof info.cluster.q).toBe('number');
        expect(typeof info.cluster.n).toBe('number');
        expect(typeof info.cluster.w).toBe('number');
        expect(typeof info.cluster.r).toBe('number');
        expect(typeof info.instance_start_time).toBe('string');
      });;
  });

  it('PUT /{db}', () => {
    const dbname = uuid();

    return api.put(`/${dbname}`).expect(201, { ok: true })
      .then(() => api.put(`/${dbname}`).expect(412, {
        error: 'file_exists',
        reason: 'The database could not be created, the file already exists.'
      }));
  });

  it('DELETE /{db}', () => {
    const dbname = uuid();

    return api.delete(`/${dbname}`).expect(404)
      .then(() => api.put(`/${dbname}`).expect(201))
      .then(() => api.delete(`/${dbname}`).expect(200));
  });

  it('POST /{db}', () => {
    const dbname = uuid();

    couch.addDatabase(dbname);

    return api.post(`/${dbname}`)
      .send({ data: 'hello' })
      .expect(201)
      .then(() => api.post(`/${dbname}`).send({ _id: '001', data: 'hello' }).expect(201))
      .then(({ body, headers }) => {
        expect(body.ok).toBeTruthy();
        expect(body.id).toBe('001');
        expect(typeof body.rev).toBe('string');
        expect(headers.location).toBe(`${couch.serveUrl}/${dbname}/001`);
      })
      .then(() => api.post(`/${dbname}`).send({ _id: '001' }).expect(409, {
        error: 'duplicate',
        reason: 'A Conflicting Document with same ID already exists'
      }));
  });

  it('GET, POST /{db}/_all_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_all_docs`;
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: 'x000', data: 1 },
      { _id: 'x001', data: 2 },
      { _id: 'x010', data: 3 },
      { _id: 'x011', data: 4 },
      { _id: 'x100', data: 5 },
    ]);

    const expectedRows = Object.values(db.docs).map((doc) => ({
      value: {
        rev: doc._rev
      },
      id: doc._id,
      key: doc._id
    }));

    const expectedRowsWithDocs = expectedRows.slice(1, 3).map((item) => {
      return { ...item, doc: db.docs[item.id] };
    });

    return api.get(endpoint)
      .expect(200, {
        offset: 0,
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      .then(() => api.get(`${endpoint}?include_docs=true&skip=1&limit=2`)
      .expect(200, {
        offset: 1,
        total_rows: expectedRowsWithDocs.length,
        rows: expectedRowsWithDocs
      }))
      .then(() => api.post(endpoint).send({ keys: ['x001'] })
      .expect(200, {
        offset: 0,
        total_rows: 1,
        rows: [
          {
            id: 'x001',
            key: 'x001',
            value: {
              rev: db.docs.x001._rev
            }
          }
        ]
      }))
      .then(() => api.post(`${endpoint}?include_docs=true`).send({ keys: ['x001'] })
      .expect(200, {
        offset: 0,
        total_rows: 1,
        rows: [
          {
            id: 'x001',
            key: 'x001',
            value: {
              rev: db.docs.x001._rev
            },
            doc: db.docs.x001
          }
        ]
      }));
  });

  it('GET /{db}/_design_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_design_docs`;
    const db = couch.addDatabase(dbname);
    const ddoc = db.addDesign({
      _id: '_design/posts',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    });

    return api.get(endpoint).expect(200, {
      offset: 0,
      total_rows: 1,
      rows: [
        {
          id: ddoc._id,
          key: ddoc._id,
          value: {
            rev: ddoc._rev
          }
        }
      ],
    });
  });

  it('POST /{db}/_design_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_design_docs`;
    const db = couch.addDatabase(dbname);
    const ddocposts = db.addDesign({
      _id: '_design/posts',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    });
    const ddocpages = db.addDesign({
      _id: '_design/pages',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "pages") emit(doc._id, doc._rev)}'
        }
      }
    });

    return api.post(endpoint).send({ keys: [ddocpages._id] }).expect(200, {
      offset: 0,
      total_rows: 1,
      rows: [
        {
          id: ddocpages._id,
          key: ddocpages._id,
          value: {
            rev: ddocpages._rev
          }
        }
      ],
    });
  });

  it('POST /{db}/_all_docs/queries', () => {
    const dbname = uuid();

    couch.addDatabase(dbname);

    return api.post(`/${dbname}/_all_docs/queries`).expect(501, 'Not Yet Implemented');
  });

  it('POST /{db}/_bulk_get', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_bulk_get`;
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: 'x000', data: 1 },
      { _id: 'x001', data: 2 },
      { _id: 'x010', data: 3 },
      { _id: 'x011', data: 4 },
      { _id: 'x100', data: 5 },
    ]);

    const query = Object.values(db.docs).map((doc) => ({
      id: doc._id
    }));

    const expectedRows = Object.values(db.docs).map((doc) => ({
      id: doc._id,
      docs: [
        {
          ok: {
            _id: doc._id,
            _rev: doc._rev,
            value: doc,
            _revisions: {
              start: 1,
              ids: [
                doc._rev.split('-')[1]
              ]
            }
          }
        }
      ]
    }));

    return api.post(endpoint).send({ docs: query }).expect(200, {
      results: expectedRows
    });
  });

  it('POST /{db}/_bulk_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_bulk_docs`;
    const db = couch.addDatabase(dbname);
    const docs = [
      { _id: 'x000', data: 1, _deleted: true },
      { _id: 'x001', data: 2 },
      { _id: 'x010', data: 3 },
      { _id: 'x011', data: 4 },
      { _id: 'x100', data: 5 },
    ];

    db.addDoc({ _id: 'x000', data: 1 });

    return api.post(endpoint).send({ docs }).expect(201).then(({ body }) => {
      const expected = Object.values(db.docs).map((doc) => ({
        ok: true,
        id: doc._id,
        rev: doc._rev,
      }));

      expect(body).toEqual(expected);
    });
  });

  describe('POST /{db}/_find', () => {
    const docs = [
      { _id: 'x000', type: 'posts', data: { title: 'Post 1', s: 5, desc: 'Lorem 1', n: 1, enabled: true } },
      { _id: 'x001', type: 'posts', data: { title: 'Post 2', s: 2, desc: 'Lorem 2', n: 2, enabled: false } },
      { _id: 'x010', type: 'pages', data: { title: 'Page 1', s: 2, desc: 'Lorem 1', n: 1, slug: 'page1' } },
      { _id: 'x011', type: 'pages', data: { title: 'Page 2', s: 1, desc: null, n: 2, slug: 'page2' } },
      { _id: 'x100', type: 'posts', data: { title: 'Post 3', s: 1, desc: 'Lorem 3', n: 3 } },
      { _id: 'x101', type: 'posts', data: { title: 'Post 4', s: 3, desc: 'Lorem 4', n: 4, list: [1, 2] } },
      { _id: 'x110', type: 'posts', data: { title: 'Post 5', s: 4, desc: null, n: 5, list: [1] } },
    ];

    it('scalar', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        skip: 1,
        limit: 2,
        selector: {
          type: 'posts',
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send({ limit: 2 }).expect(400)
        .then(() => api.post(endpoint).send(query).expect(200, {
          docs: [
            db.docs.x001,
            db.docs.x100,
          ]
        }));
    });

    it('$regex', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        skip: 1,
        limit: 2,
        selector: {
          'data.title': {
            $regex: 'Post (1|3|5)'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x100,
          db.docs.x110,
        ]
      });
    });

    it('fields & execution_stats', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        skip: 1,
        limit: 2,
        selector: {
          'data.title': {
            $regex: 'Post (1|3|4)'
          }
        },
        fields: [
          'type',
          'data.n'
        ],
        execution_stats: true
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200).then(({ body }) => {
        expect(typeof body.execution_stats.execution_time_ms).toBe('number');

        body.execution_stats.execution_time_ms = -1;

        expect(body).toEqual({
          docs: [
            {
              type: db.docs.x100.type,
              data: {
                n: db.docs.x100.data.n
              }
            },
            {
              type: db.docs.x101.type,
              data: {
                n: db.docs.x101.data.n
              }
            },
          ],
          execution_stats: {
            total_keys_examined: 0,
            total_docs_examined: 7,
            total_quorum_docs_examined: 0,
            results_returned: 2,
            execution_time_ms: -1
          }
        });
      });
    });

    it('$gt & $lt', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $gt: 1,
            $lt: 3,
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
        ]
      });
    });

    it('$gte & $lte', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $gte: 2,
            $lte: 3,
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
          db.docs.x100,
        ]
      });
    });

    it('null', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.desc': null
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x110,
        ]
      });
    });

    it('$eq', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          type: {
            $eq: 'pages'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      });
    });

    it('$ne', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          type: {
            $ne: 'posts'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      });
    });

    it('array', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.list': [1]
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x110,
        ]
      });
    });

    it('$in', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.list': {
            $in: [2]
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x101,
        ]
      });
    });

    it('$nin', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.list': {
            $nin: [2]
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x110,
        ]
      });
    });

    it('$size', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.list': {
            $size: 2
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x101,
        ]
      });
    });

    it('$exists = true', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.slug': {
            $exists: true
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      });
    });

    it('$exists = false', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.slug': {
            $exists: false
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      });
    });

    it('$type string', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.desc': {
            $type: 'string'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x100,
          db.docs.x101,
        ]
      });
    });

    it('$type boolean', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.enabled': {
            $type: 'boolean'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
        ]
      });
    });

    it('$type null', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.desc': {
            $type: 'null'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x110,
        ]
      });
    });

    it('$type number', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $type: 'number'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x011,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      });
    });

    it('$type array', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.list': {
            $type: 'array'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x101,
          db.docs.x110,
        ]
      });
    });

    it('$type object', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          data: {
            $type: 'object'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x011,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      });
    });

    it('$mod', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $mod: [2, 0]
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
          db.docs.x101,
        ]
      });
    });

    it('$mod with invalid divisor', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $mod: ['2', 0]
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: []
      });
    });

    it('$mod with invalid remainder', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $mod: [2, '0']
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: []
      });
    });

    it('invalid operator', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          'data.n': {
            $invalidOperator: 'x'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('sort with default asc', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          type: 'posts'
        },
        sort: [
          'data.s'
        ]
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x100,
          db.docs.x001,
          db.docs.x101,
          db.docs.x110,
          db.docs.x000,
        ]
      });
    });

    it('sort with asc and fields', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          type: 'posts'
        },
        sort: [
          { 'data.s': 'asc' }
        ],
        fields: ['_id']
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          { _id: db.docs.x100._id },
          { _id: db.docs.x001._id },
          { _id: db.docs.x101._id },
          { _id: db.docs.x110._id },
          { _id: db.docs.x000._id },
        ]
      });
    });

    it('sort with desc', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          type: 'posts'
        },
        sort: [
          { 'data.s': 'desc' }
        ]
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x110,
          db.docs.x101,
          db.docs.x001,
          db.docs.x100,
        ]
      });
    });

    it('$and with invalid value', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $and: {}
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('$and', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $and: [
            {
              type: 'posts'
            },
            {
              'data.desc': null
            }
          ]
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x110,
        ]
      });
    });

    it('$or with invalid value', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $or: {}
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('$or', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $or: [
            {
              'data.title': 'Post 1'
            },
            {
              'data.title': {
                $regex: '(Post|Page) 1'
              }
            }
          ]
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x010,
        ]
      });
    });

    it('$not with invalid value', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $not: []
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('$not', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $not: {
            'data.desc': {
              $ne: null
            }
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x110,
        ]
      });
    });

    it('$nor with invalid value', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $and: [
            {
              year: {
                $gte: 1900
              },
            },
            {
              year: {
                $lte: 1910
              },
            }
          ],
          $nor: { year: 1901 },
        }
      };

      db.addDocs([
        { _id: 'x1899', type: 'posts', year: 1899 },
        { _id: 'x1900', type: 'posts', year: 1900 },
        { _id: 'x1901', type: 'posts', year: 1901 },
        { _id: 'x1902', type: 'pages', year: 1902 },
        { _id: 'x1903', type: 'pages', year: 1903 },
        { _id: 'x1904', type: 'posts', year: 1904 },
        { _id: 'x1905', type: 'posts', year: 1905 },
        { _id: 'x1907', type: 'posts', year: 1907 },
        { _id: 'x1910', type: 'posts', year: 1910 },
        { _id: 'x1911', type: 'posts', year: 1911 },
      ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('$nor', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          $and: [
            {
              year: {
                $gte: 1900
              },
            },
            {
              year: {
                $lte: 1910
              },
            }
          ],
          $nor: [
            { year: 1901 },
            { year: 1905 },
            { year: 1907 },
          ]
        }
      };

      db.addDocs([
        { _id: 'x1899', type: 'posts', year: 1899 },
        { _id: 'x1900', type: 'posts', year: 1900 },
        { _id: 'x1901', type: 'posts', year: 1901 },
        { _id: 'x1902', type: 'pages', year: 1902 },
        { _id: 'x1903', type: 'pages', year: 1903 },
        { _id: 'x1904', type: 'posts', year: 1904 },
        { _id: 'x1905', type: 'posts', year: 1905 },
        { _id: 'x1907', type: 'posts', year: 1907 },
        { _id: 'x1910', type: 'posts', year: 1910 },
        { _id: 'x1911', type: 'posts', year: 1911 },
      ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x1900,
          db.docs.x1902,
          db.docs.x1903,
          db.docs.x1904,
          db.docs.x1910,
        ]
      });
    });

    it('$all with invalid value', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          genre: {
            $all: 'Comedy'
          }
        }
      };

      db.addDocs([ ...docs ]);

      return api.post(endpoint).send(query).expect(400);
    });

    it('$all', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          genre: {
            $all: ['Comedy', 'Short']
          }
        }
      };

      db.addDocs([
        { _id: 'comedy1', type: 'movie', genre: 'Comedy' },
        { _id: 'short1', type: 'movie', genre: 'Short' },
        { _id: 'short2', type: 'movie', genre: 'Short' },
        { _id: 'action1', type: 'movie', genre: 'Action' },
        { _id: 'action2', type: 'movie', genre: 'Action' },
        { _id: 'comedy2', type: 'movie', genre: 'Comedy' },
        { _id: 'short3', type: 'movie', genre: 'Short' },
      ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.comedy1,
          db.docs.short1,
          db.docs.short2,
          db.docs.comedy2,
          db.docs.short3,
        ]
      });
    });

    it('$elemMatch', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          genre: {
            $elemMatch: {
              $eq: 'Horror'
            }
          }
        }
      };

      db.addDocs([
        { _id: 'x001', type: 'movie', genre: ['Comedy', 'Horror'] },
        { _id: 'x010', type: 'movie', genre: ['Comedy', 'Short'] },
        { _id: 'x011', type: 'movie', genre: ['Horror', 'Action'] },
        { _id: 'x100', type: 'movie', genre: ['Comedy'] },
        { _id: 'x101', type: 'movie', genre: ['Horror'] },
      ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
          db.docs.x101,
        ]
      });
    });

    it('$allMatch', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          genre: {
            $allMatch: {
              $eq: 'Horror'
            }
          }
        }
      };

      db.addDocs([
        { _id: 'x001', type: 'movie', genre: ['Comedy', 'Horror'] },
        { _id: 'x010', type: 'movie', genre: ['Comedy', 'Short'] },
        { _id: 'x011', type: 'movie', genre: ['Horror', 'Action'] },
        { _id: 'x100', type: 'movie', genre: ['Comedy'] },
        { _id: 'x101', type: 'movie', genre: ['Horror'] },
      ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x101,
        ]
      });
    });

    it('$keyMapMatch', () => {
      const dbname = uuid();
      const endpoint = `/${dbname}/_find`;
      const db = couch.addDatabase(dbname);
      const query = {
        selector: {
          cameras: {
            $keyMapMatch: {
              $eq: 'secondary'
            }
          }
        }
      };

      db.addDocs([
        { _id: 'x001', type: 'movie', cameras: { primary: 1 } },
        { _id: 'x010', type: 'movie', cameras: { primary: 1 } },
        { _id: 'x011', type: 'movie', cameras: { primary: 1, secondary: 2 } },
        { _id: 'x100', type: 'movie', cameras: { primary: 1, secondary: 2 } },
        { _id: 'x101', type: 'movie', cameras: { primary: 1 } },
      ]);

      return api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x100,
        ]
      });
    });
  });

  it('POST /{db}/_index', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_index`;

    const payload1 = {
      ddoc: 'nameindex',
      name: 'nameindex',
      partitioned: true,
      index: {
        fields: ['name']
      }
    };

    const payload2 = {
      partitioned: true,
      index: {
        fields: ['name']
      }
    };

    couch.addDatabase(dbname);

    return api.post(endpoint).send({}).expect(400)
      .then(() => api.post(endpoint).send(payload1).expect(200, {
        result: 'created',
        id: '_design/nameindex',
        name: 'nameindex'
      }))
      .then(() => api.post(endpoint).send(payload2).expect(200))
      .then(({ body }) => {
        expect(body.result).toBe('created');
        expect(typeof body.id).toBe('string');
        expect(typeof body.name).toBe('string');
      });
  });

  it('GET /{db}/_index', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_index`;
    const db = couch.addDatabase(dbname);

    db.addIndex({
      ddoc: 'nameindex',
      name: 'nameindex',
      partitioned: true,
      index: {
        fields: ['name']
      }
    });

    return api.get(endpoint).expect(200, {
      total_rows: 2,
      indexes: [
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
        },
        {
          ddoc: '_design/nameindex',
          name: 'nameindex',
          type: 'json',
          def: {
            fields: [
              {
                name: 'asc'
              }
            ]
          }
        }
      ]
    });
  });

  it('DELETE /{db}/_index/{designdoc}/json/{name}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);

    db.addIndex({
      ddoc: 'nameindex',
      name: 'nameindex',
      partitioned: true,
      index: {
        fields: ['name']
      }
    });

    return Promise.all([
      api.delete(`/${dbname}/_index/_design/404/json/nameindex`).expect(404, 'Index not found'),
      api.delete(`/${dbname}/_index/_design/nameindex/json/404`).expect(404, 'Index not found'),
      api.delete(`/${dbname}/_index/_design/nameindex/json/nameindex`).expect(200, { ok: true }),
    ]);
  });

  it('POST /{db}/_explain', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_explain`;

    couch.addDatabase(dbname);

    return api.post(endpoint).expect(501, 'Not Yet Implemented');
  });

  it('GET /{db}/_shards', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_shards`;

    couch.addDatabase(dbname);

    return api.get(endpoint).expect(200, {
      shards: {
        '00000000-1fffffff': [
          'couchdb@node1.example.com'
        ],
        '20000000-3fffffff': [
          'couchdb@node1.example.com'
        ]
      }
    });
  });

  it('GET /{db}/_shards/{docid}', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_shards/docid`;

    couch.addDatabase(dbname);

    return api.get(endpoint).expect(200, {
      range: 'e0000000-ffffffff',
      nodes: [
        'node1@127.0.0.1'
      ]
    });
  });

  it('POST /{db}/_sync_shards', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_sync_shards`;

    couch.addDatabase(dbname);

    return api.post(endpoint).expect(200, {
      ok: true
    });
  });

  it('GET /{db}/_changes', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_changes`;

    couch.addDatabase(dbname);

    return api.get(endpoint).expect(501, 'Not Yet Implemented');
  });

  it('POST /{db}/_compact', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_compact`;

    couch.addDatabase(dbname);

    return api.post(endpoint).expect(202, { ok: true });
  });

  it('POST /{db}/_compact/{ddoc}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);

    db.addDesign({
      _id: '_design/posts',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    });

    return Promise.all([
      api.post('/404/_compact/posts').expect(400),
      api.post(`/${dbname}/_compact/404`).expect(404, 'Design document not found'),
      api.post(`/${dbname}/_compact/posts`).expect(202, { ok: true }),
    ]);
  });

  it('POST /{db}/_ensure_full_commit', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_ensure_full_commit`;

    couch.addDatabase(dbname);

    return api.post(endpoint).expect(201, {
      ok: true,
      instance_start_time: '0'
    });
  });

  it('POST /{db}/_view_cleanup', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_view_cleanup`;

    couch.addDatabase(dbname);

    return api.post(endpoint).expect(202, { ok: true });
  });
});
