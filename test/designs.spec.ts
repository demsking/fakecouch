import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { v4 as uuid } from 'uuid';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59846,
  logger: false
});

const api = supertest(couch.serveUrl);

describe('Design Documents', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('HEAD /{db}/_design/{ddoc}/_view/{view}', () => {
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
      api.head(`/${dbname}/_design/404/_view/items`).expect(404),
      api.head(`/${dbname}/_design/posts/_view/404`).expect(404),
      api.head(`/${dbname}/_design/posts/_view/items`).expect(200),
    ]);
  });

  describe('GET /{db}/_design/{ddoc}/_view/{view}', () => {
    const dbname = uuid();
    let db: IFakeCouch.Database;

    beforeAll(() => {
      db = couch.addDatabase(dbname);

      db.addDocs([
        { _id: 'xpost1', type: 'posts', year: 1990, value: 2 },
        { _id: 'xpost3', type: 'posts', year: 1900, value: 4 },
        { _id: 'xpost0', type: 'posts', year: 1899, value: 1 },
        { _id: 'xpost2', type: 'posts', year: 1900, value: 3 },
        { _id: 'xpage0', type: 'pages', year: 2000, value: 1 },
      ]);

      db.addDesign({
        _id: '_design/posts',
        views: {
          items: {
            map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}',
          },
          by_year_count: {
            map: '(doc) => {if(doc.type === "posts") emit(doc.year, doc.value)}',
            reduce: '_count'
          },
          by_year_sum: {
            map: '(doc) => {if(doc.type === "posts") emit(doc.year, doc.value)}',
            reduce: '_sum'
          },
        }
      });
    });

    it('GET /${dbname}/_design/404/_view/items', () => {
      return api.get(`/${dbname}/_design/404/_view/items`).expect(404);
    });

    it('GET /${dbname}/_design/posts/_view/404', () => {
      return api.get(`/${dbname}/_design/posts/_view/404`).expect(404);
    });

    it('GET /${dbname}/_design/posts/_view/items', () => {
      return api.get(`/${dbname}/_design/posts/_view/items`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?skip=1', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?skip=1`).expect(200, {
        offset: 1,
        total_rows: 3,
        rows: [
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?limit=2', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?limit=2`).expect(200, {
        offset: 0,
        total_rows: 2,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?skip=1&limit=2', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?skip=1&limit=2`).expect(200, {
        offset: 1,
        total_rows: 2,
        rows: [
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?include_docs=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?include_docs=true`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
            doc: db.docs.xpost0,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
            doc: db.docs.xpost1,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
            doc: db.docs.xpost2,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
            doc: db.docs.xpost3,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?include_docs=false', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?include_docs=false`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?descending=invalid', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?descending=invalid`).expect(400, {
        error: 'query_parse_error',
        reason: 'Invalid boolean parameter: "invalid"'
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?descending=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?descending=true`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/items?descending=false', () => {
      return api.get(`/${dbname}/_design/posts/_view/items?descending=false`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0._id,
            value: db.docs.xpost0._rev,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1._id,
            value: db.docs.xpost1._rev,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2._id,
            value: db.docs.xpost2._rev,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3._id,
            value: db.docs.xpost3._rev,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=true`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1.year,
            value: db.docs.xpost1.value,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3.year,
            value: db.docs.xpost3.value,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2.year,
            value: db.docs.xpost2.value,
          },
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0.year,
            value: db.docs.xpost0.value,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=false', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=false`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0.year,
            value: db.docs.xpost0.value,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3.year,
            value: db.docs.xpost3.value,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2.year,
            value: db.docs.xpost2.value,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1.year,
            value: db.docs.xpost1.value,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=false&skip=1', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=false&descending=false&skip=1`).expect(200, {
        offset: 1,
        total_rows: 3,
        rows: [
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3.year,
            value: db.docs.xpost3.value,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2.year,
            value: db.docs.xpost2.value,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1.year,
            value: db.docs.xpost1.value,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=true`).expect(200, {
        rows: [
          {
            key: null,
            value: 4,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=true&group=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=true&group=true`).expect(200, {
        rows: [
          {
            key: 1899,
            value: 1,
          },
          {
            key: 1900,
            value: 2,
          },
          {
            key: 1990,
            value: 1,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_count?reduce=true&group=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_count?reduce=true&group=true`).expect(200, {
        rows: [
          {
            key: 1899,
            value: 1,
          },
          {
            key: 1900,
            value: 2,
          },
          {
            key: 1990,
            value: 1,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_sum?reduce=false', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_sum?reduce=false`).expect(200, {
        offset: 0,
        total_rows: 4,
        rows: [
          {
            id: db.docs.xpost0._id,
            key: db.docs.xpost0.year,
            value: db.docs.xpost0.value,
          },
          {
            id: db.docs.xpost3._id,
            key: db.docs.xpost3.year,
            value: db.docs.xpost3.value,
          },
          {
            id: db.docs.xpost2._id,
            key: db.docs.xpost2.year,
            value: db.docs.xpost2.value,
          },
          {
            id: db.docs.xpost1._id,
            key: db.docs.xpost1.year,
            value: db.docs.xpost1.value,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_sum?reduce=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_sum?reduce=true`).expect(200, {
        rows: [
          {
            key: null,
            value: 10,
          },
        ]
      });
    });

    it('GET /${dbname}/_design/posts/_view/by_year_sum?reduce=true&group=true', () => {
      return api.get(`/${dbname}/_design/posts/_view/by_year_sum?reduce=true&group=true`).expect(200, {
        rows: [
          {
            key: 1899,
            value: 1,
          },
          {
            key: 1900,
            value: 7,
          },
          {
            key: 1990,
            value: 2,
          },
        ]
      });
    });
  });

  it('HEAD /{db}/_design/{ddoc}', () => {
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
      api.head(`/${dbname}/_design/404`).expect(404),
      api.head(`/${dbname}/_design/posts`).expect(200),
    ]);
  });

  it('GET /{db}/_design/{ddoc}', () => {
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
      api.get(`/${dbname}/_design/404`).expect(404),
      api.get(`/${dbname}/_design/posts`).expect(200).then(({ body }) => {
        expect(typeof body._rev).toBe('string');

        delete body._rev;

        expect(body).toEqual({
          _id: '_design/posts',
          views: {
            items: {
              map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
            }
          }
        });
      }),
    ]);
  });

  it('PUT /{db}/_design/{ddoc}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const ddoc = {
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    };

    db.addDesign({
      ...ddoc,
      _id: '_design/posts',
    });

    return Promise.all([
      api.put(`/${dbname}/_design/posts`).expect(409),
      api.put(`/${dbname}/_design/pages`).send(ddoc).expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: '_design/pages',
        });
      }),
    ]);
  });

  it('DELETE /{db}/_design/{ddoc}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const ddoc = {
      _id: '_design/posts',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    };

    db.addDesign(ddoc);

    return Promise.all([
      api.delete(`/${dbname}/_design/404`).expect(404),
      api.delete(`/${dbname}/_design/posts`).expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: '_design/posts',
        });
      }),
    ]);
  });

  it('COPY /{db}/_design/{ddoc}', () => {
    const dbname = uuid();
    const db = couch.addDatabase(dbname);
    const ddoc = {
      _id: '_design/posts',
      views: {
        items: {
          map: '(doc) => {if(doc.type === "posts") emit(doc._id, doc._rev)}'
        }
      }
    };

    db.addDesign(ddoc);

    return Promise.all([
      api.copy(`/${dbname}/_design/404`).expect(404),
      api.copy(`/${dbname}/_design/posts`).expect(400),
      api.copy(`/${dbname}/_design/posts`).set('destination', 'pages').expect(400),
      api.copy(`/${dbname}/_design/posts`).set('destination', ddoc._id).expect(409),
      api.copy(`/${dbname}/_design/posts`).set('destination', '_design/pages').expect(200).then(({ body }) => {
        expect(typeof body.rev).toBe('string');

        delete body.rev;

        expect(body).toEqual({
          ok: true,
          id: '_design/pages',
        });
      }),
    ]);
  });
});
