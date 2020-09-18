import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { v4 as uuid } from 'uuid';
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
});
