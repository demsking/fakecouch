const uuid = require('uuid-random');

import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59845,
  logger: false,
});

const api = supertest(couch.serveUrl);

describe('Documents', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('HEAD /{db}/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: 'x1899', type: 'posts', year: 1899 },
    ]);

    return Promise.all([
      api.head(`/${dbname}/404`).expect(404),
      api.head(`/${dbname}/x1899`).expect(200),
    ]);
  });

  it('GET /{db}/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);

    db.addDocs([
      { _id: 'x1899', type: 'posts', year: 1899 },
    ]);

    return Promise.all([
      api.get(`/${dbname}/404`).expect(404),
      api.get(`/${dbname}/x1899`).expect(200).then(({ body }) => {
        expect(typeof body._rev).toBe('string');

        delete body._rev;

        expect(body).toEqual({ _id: 'x1899', type: 'posts', year: 1899 });
      }),
    ]);
  });

  it('PUT /{db}/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: 'x1900', type: 'posts', year: 1900 };

    db.addDocs([
      { _id: 'x1899', type: 'posts', year: 1899 },
    ]);

    return Promise.all([
      api.put(`/${dbname}/x1899`).send({ _id: 'x1899' }).expect(409),
      api.put(`/${dbname}/x1899`).send(db.docs.x1899).expect(201),
      api.put(`/${dbname}/x1900`).send(doc).expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: 'x1900',
        });
      }),
    ]);
  });

  it('DELETE /{db}/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: 'x1900', type: 'posts', year: 1900 };

    db.addDocs([doc]);

    return Promise.all([
      api.delete(`/${dbname}/404`).expect(404),
      api.delete(`/${dbname}/x1900`).expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: doc._id,
        });
      }),
    ]);
  });

  it('COPY /{db}/{docid}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const doc = { _id: 'x1900', type: 'posts', year: 1900 };

    db.addDocs([doc]);

    return Promise.all([
      api.copy(`/${dbname}/404`).expect(404),
      api.copy(`/${dbname}/x1900`).expect(400),
      api.copy(`/${dbname}/x1900`).set('destination', doc._id).expect(409),
      api.copy(`/${dbname}/x1900`).set('destination', 'x1901').expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: 'x1901',
        });
      }),
    ]);
  });
});
