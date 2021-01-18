import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59899,
  logger: false,
  headers: {
    'x-hello': 'world',
  },
});

const api = supertest(couch.serveUrl);

describe('Server', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('options.headers', () => {
    return api.get('/').expect(200).then(({ headers, body }) => {
      expect(headers['x-hello']).toBe('world');
      expect(couch.headers['x-hello']).toBe('world');
    });
  });
});
