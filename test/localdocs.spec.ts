const uuid = require('uuid-random');

import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59844,
  logger: false
});

const api = supertest(couch.serveUrl);

describe('Local (non-replicating) Documents', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('GET /{db}/_local_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_local_docs`;
    const db = couch.addDatabase(dbname);

    return api.get(endpoint)
      .expect(200, {
        offset: 0,
        rows: [],
        total_rows: 0
      })
      .then(() => db.addDocs([
        { _id: '_local/x1899', type: 'posts', year: 1899 },
        { _id: '_local/x1900', type: 'posts', year: 1900 },
      ]))
      .then(() => api.get(endpoint).expect(200, {
        offset: 0,
        rows: [
          { _id: '_local/x1899', _rev: '0-1', type: 'posts', year: 1899 },
          { _id: '_local/x1900', _rev: '0-1', type: 'posts', year: 1900 },
        ],
        total_rows: 2
      }));
  });

  it('POST /{db}/_local_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_local_docs`;
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: '_local/x1899', type: 'posts', year: 1899 },
      { _id: '_local/x1900', type: 'posts', year: 1900 },
    ]);

    return api.post(endpoint).send({ keys: ['_local/x1899'] }).expect(200, {
        offset: 0,
        rows: [
          {
            value: {
              rev: '0-1',
            },
            id: '_local/x1899',
            key: '_local/x1899',
          }
        ],
        total_rows: 1
      });
  });

  it('GET /{db}/_local/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: '_local/x1899', type: 'posts', year: 1899 },
    ]);

    return Promise.all([
      api.get(`/${dbname}/_local/404`).expect(404),
      api.get(`/${dbname}/_local/x1899`).expect(200, {
        ...db.localDocs['_local/x1899'],
        _rev: '0-1'
      }),
    ]);
  });

  it('PUT /{db}/_local/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: '_local/x1900', type: 'posts', year: 1900 };

    db.addDocs([
      { _id: '_local/x1899', type: 'posts', year: 1899 },
    ]);

    return Promise.all([
      api.put(`/${dbname}/_local/x1899`).send({ _id: '_local/x1899' }).expect(409),
      api.put(`/${dbname}/_local/x1900`).send(doc).expect(200, {
        ok: true,
        id: doc._id,
        rev: '0-1'
      }),
    ]);
  });

  it('DELETE /{db}/_local/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: '_local/x1900', type: 'posts', year: 1900 };

    db.addDocs([doc]);

    return Promise.all([
      api.delete(`/${dbname}/_local/404`).expect(404),
      api.delete(`/${dbname}/_local/x1900`).expect(200, {
        ok: true,
        id: doc._id,
        rev: '0-1'
      }),
    ]);
  });

  it('COPY /{db}/_local/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: '_local/x1900', type: 'posts', year: 1900 };

    db.addDocs([doc]);

    return Promise.all([
      api.copy(`/${dbname}/_local/404`).expect(404),
      api.copy(`/${dbname}/_local/x1900`).expect(400),
      api.copy(`/${dbname}/_local/x1900`).set('destination', 'x1901').expect(400),
      api.copy(`/${dbname}/_local/x1900`).set('destination', doc._id).expect(409),
      api.copy(`/${dbname}/_local/x1900`).set('destination', '_local/x1901').expect(200, {
        ok: true,
        id: '_local/x1901',
        rev: '0-1'
      }),
    ]);
  });
});
