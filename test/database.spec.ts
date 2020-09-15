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

  it('POST /{db}/_find', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_find`;
    const db = couch.addDatabase(dbname);
    const query = {
      skip: 1,
      limit: 2,
      selector: {
        type: 'posts',
        'data.title': {
          $regex: 'Post (1|3|4)'
        }
      }
    };

    const queryWithFields = {
      ...query,
      fields: [
        'type',
        'data.n'
      ],
      execution_stats: true
    };

    const queryWithGtLt = {
      selector: {
        'data.n': {
          $gt: 1,
          $lt: 3,
        }
      }
    };

    const queryWithGteLte = {
      selector: {
        'data.n': {
          $gte: 2,
          $lte: 3,
        }
      }
    };

    const queryWithNull = {
      selector: {
        'data.desc': null
      }
    };

    const queryWithEq = {
      selector: {
        type: {
          $eq: 'pages'
        }
      }
    };

    const queryWithNe = {
      selector: {
        type: {
          $ne: 'posts'
        }
      }
    };

    const queryWithArray = {
      selector: {
        'data.list': [1]
      }
    };

    const queryWithIn = {
      selector: {
        'data.list': {
          $in: [2]
        }
      }
    };

    const queryWithNin = {
      selector: {
        'data.list': {
          $nin: [2]
        }
      }
    };

    const queryWithSize = {
      selector: {
        'data.list': {
          $size: 2
        }
      }
    };

    const queryWithExistsTrue = {
      selector: {
        'data.slug': {
          $exists: true
        }
      }
    };

    const queryWithExistsFalse = {
      selector: {
        'data.slug': {
          $exists: false
        }
      }
    };

    const queryWithTypeString = {
      selector: {
        'data.desc': {
          $type: 'string'
        }
      }
    };

    const queryWithTypeBoolean = {
      selector: {
        'data.enabled': {
          $type: 'boolean'
        }
      }
    };

    const queryWithTypeNull = {
      selector: {
        'data.desc': {
          $type: 'null'
        }
      }
    };

    const queryWithTypeNumber = {
      selector: {
        'data.n': {
          $type: 'number'
        }
      }
    };

    const queryWithTypeArray = {
      selector: {
        'data.list': {
          $type: 'array'
        }
      }
    };

    const queryWithTypeObject = {
      selector: {
        data: {
          $type: 'object'
        }
      }
    };

    const queryWithMod = {
      selector: {
        'data.n': {
          $mod: [2, 0]
        }
      }
    };

    const queryWithModInvalidDivisor = {
      selector: {
        'data.n': {
          $mod: ['2', 0]
        }
      }
    };

    const queryWithModInvalidRemainder = {
      selector: {
        'data.n': {
          $mod: [2, '0']
        }
      }
    };

    const queryWithModInvalidOperator = {
      selector: {
        'data.n': {
          $invalidOperator: 'x'
        }
      }
    };

    const queryWithSortDefaultAsc = {
      selector: {
        type: 'posts'
      },
      sort: [
        'data.s'
      ]
    };

    const queryWithSortAsc = {
      selector: {
        type: 'posts'
      },
      sort: [
        { 'data.s': 'asc' }
      ]
    };

    const queryWithSortDesc = {
      selector: {
        type: 'posts'
      },
      sort: [
        { 'data.s': 'desc' }
      ]
    };

    db.addDocs([
      { _id: 'x000', type: 'posts', data: { title: 'Post 1', s: 5, desc: 'Lorem 1', n: 1, enabled: true } },
      { _id: 'x001', type: 'posts', data: { title: 'Post 2', s: 2, desc: 'Lorem 2', n: 2, enabled: false } },
      { _id: 'x010', type: 'pages', data: { title: 'Page 1', s: 2, desc: 'Lorem 1', n: 1, slug: 'page1' } },
      { _id: 'x011', type: 'pages', data: { title: 'Page 2', s: 1, desc: null, n: 2, slug: 'page2' } },
      { _id: 'x100', type: 'posts', data: { title: 'Post 3', s: 1, desc: 'Lorem 3', n: 3 } },
      { _id: 'x101', type: 'posts', data: { title: 'Post 4', s: 3, desc: 'Lorem 4', n: 4, list: [1, 2] } },
      { _id: 'x110', type: 'posts', data: { title: 'Post 5', s: 4, desc: null, n: 5, list: [1] } },
    ]);

    return api.post(endpoint).send({ limit: 2 }).expect(400)
      .then(() => api.post(endpoint).send(query).expect(200, {
        docs: [
          db.docs.x100,
          db.docs.x101,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithFields).expect(200))
      .then(({ body }) => {
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
      })
      .then(() => api.post(endpoint).send(queryWithGtLt).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithGteLte).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
          db.docs.x100,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithNull).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithEq).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithNe).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithArray).expect(200, {
        docs: [
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithIn).expect(200, {
        docs: [
          db.docs.x101,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithNin).expect(200, {
        docs: [
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithSize).expect(200, {
        docs: [
          db.docs.x101,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithExistsTrue).expect(200, {
        docs: [
          db.docs.x010,
          db.docs.x011,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithExistsFalse).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeString).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x100,
          db.docs.x101,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeBoolean).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeNull).expect(200, {
        docs: [
          db.docs.x011,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeNumber).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x011,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeArray).expect(200, {
        docs: [
          db.docs.x101,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithTypeObject).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x001,
          db.docs.x010,
          db.docs.x011,
          db.docs.x100,
          db.docs.x101,
          db.docs.x110,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithMod).expect(200, {
        docs: [
          db.docs.x001,
          db.docs.x011,
          db.docs.x101,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithModInvalidDivisor).expect(200, {
        docs: []
      }))
      .then(() => api.post(endpoint).send(queryWithModInvalidRemainder).expect(200, {
        docs: []
      }))
      .then(() => api.post(endpoint).send(queryWithModInvalidOperator).expect(400))
      .then(() => api.post(endpoint).send(queryWithSortDefaultAsc).expect(200, {
        docs: [
          db.docs.x100,
          db.docs.x001,
          db.docs.x101,
          db.docs.x110,
          db.docs.x000,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithSortAsc).expect(200, {
        docs: [
          db.docs.x100,
          db.docs.x001,
          db.docs.x101,
          db.docs.x110,
          db.docs.x000,
        ]
      }))
      .then(() => api.post(endpoint).send(queryWithSortDesc).expect(200, {
        docs: [
          db.docs.x000,
          db.docs.x110,
          db.docs.x101,
          db.docs.x001,
          db.docs.x100,
        ]
      }));
  });
});
