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

  it('', () => {
    return api.get('').expect(200);
  });

  it('', () => {
    return api.get('').expect(200);
  });

  it('', () => {
    return api.get('').expect(200);
  });

  it('', () => {
    return api.get('').expect(200);
  });
});
