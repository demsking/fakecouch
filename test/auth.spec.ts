import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59842,
  logger: false
});

const api = supertest(couch.serveUrl);

describe('Authentication', () => {
  beforeEach(() => couch.setup());
  afterEach(() => couch.reset());

  it('Basic Authentication', () => {
    return api.get('/_all_dbs').expect(401)
      .then(() => api.get('/_all_dbs').set({ Authorization: 'Basic cm9vdDpyZWxheA==' }).expect(200));
  });

  it('Cookie Authentication', () => {
    return api.get('/_all_dbs').expect(401)
      .then(() => api.post('/_session').send('name=root&password=relax').expect(200, {
        ok: true,
        name: 'root',
        roles: [
          '_admin'
        ]
      }))
      .then(() => api.get('/_all_dbs').expect(200));
  });
});
