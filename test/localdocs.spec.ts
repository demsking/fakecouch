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

  it('GET, POST /{db}/_local_docs', () => {
    const dbname = uuid();
    const endpoint = `/${dbname}/_local_docs`;
    const db = couch.addDatabase(dbname);

    return api.get(endpoint)
      .expect(200, {
        offset: 0,
        rows: [],
        total_rows: 0
      })
      // .then(() => api.post(endpoint));
      // .then(() => expect(db.revisionLimit).toBe(2000));
  });
});
