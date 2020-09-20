const uuid = require('uuid-random');

import supertest from 'supertest';
import FakeCouchDB from '../lib/FakeCouch';
import pkg from '../package.json';
import { IFakeCouch } from '../typings/IFakeCouch';

const couch: IFakeCouch.Server = new FakeCouchDB({
  port: 59841,
  logger: false,
});

const api = supertest(couch.serveUrl);

describe('Server', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('GET /', () => {
    return api.get('/').expect(200).then(({ body }) => {
      expect(typeof body.uuid).toBe('string');

      delete body.uuid;

      expect(body).toEqual({
        couchdb: 'Welcome',
        git_sha: 'ff0feea20',
        features: [
          'access-ready',
        ],
        vendor: {
          name: pkg.author,
        },
        version: pkg.version,
      });
    });
  });

  it('GET /_active_tasks', () => {
    return api.get('/_active_tasks').expect(501, 'Not Yet Implemented');
  });

  it('GET /_all_dbs', () => {
    const dbname = uuid();

    return api.get('/_all_dbs').expect(200, [])
      .then(() => api.put(`/${dbname}`).expect(201))
      .then(() => api.get('/_all_dbs').expect(200, [dbname]));
  });

  it('POST /_dbs_info', () => {
    const dbname = uuid();

    return api.post('/_dbs_info')
      .send({
        keys: [],
      })
      .expect(200, [])
      .then(() => api.put(`/${dbname}`).expect(201))
      .then(() => api.post('/_dbs_info').send({
        keys: [dbname],
      }))
      .then(({ body, status }) => {
        expect(status).toBe(200);
        expect(body).toBeInstanceOf(Array);
        expect(body.length).toBe(1);
        expect(body[0].key).toBe(dbname);
        expect(body[0].info).toBeInstanceOf(Object);
        expect(Object.keys(body[0].info)).toEqual([
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
        expect(body[0].info.db_name).toBe(dbname);
        expect(typeof body[0].info.update_seq).toBe('string');
        expect(typeof body[0].info.sizes).toBe('object');
        expect(typeof body[0].info.sizes.file).toBe('number');
        expect(typeof body[0].info.sizes.external).toBe('number');
        expect(typeof body[0].info.sizes.active).toBe('number');
        expect(typeof body[0].info.purge_seq).toBe('number');
        expect(typeof body[0].info.doc_del_count).toBe('number');
        expect(typeof body[0].info.doc_count).toBe('number');
        expect(typeof body[0].info.disk_format_version).toBe('number');
        expect(typeof body[0].info.compact_running).toBe('boolean');
        expect(typeof body[0].info.cluster).toBe('object');
        expect(typeof body[0].info.cluster.q).toBe('number');
        expect(typeof body[0].info.cluster.n).toBe('number');
        expect(typeof body[0].info.cluster.w).toBe('number');
        expect(typeof body[0].info.cluster.r).toBe('number');
        expect(typeof body[0].info.instance_start_time).toBe('string');
      });
  });

  it('GET /_cluster_setup', () => {
    return api.get('/_cluster_setup').expect(200, {
      state: 'cluster_disabled',
    });
  });

  it('POST /_cluster_setup', () => {
    return api.post('/_cluster_setup').expect(501, 'Not Yet Implemented');
  });

  it('GET /_db_updates', () => {
    return api.get('/_db_updates').expect(501, 'Not Yet Implemented');
  });

  it('GET /_membership', () => {
    return api.get('/_membership').expect(200, {
      all_nodes: [
        'node1@127.0.0.1',
      ],
      cluster_nodes: [
        'node1@127.0.0.1',
      ],
    });
  });

  it('POST /_replicate', () => {
    return api.post('/_replicate').expect(200, {
      history: [
        {
          doc_write_failures: 0,
          docs_read: 10,
          docs_written: 10,
          end_last_seq: 28,
          end_time: 'Sun, 11 Aug 2013 20:38:50 GMT',
          missing_checked: 10,
          missing_found: 10,
          recorded_seq: 28,
          session_id: '142a35854a08e205c47174d91b1f9628',
          start_last_seq: 1,
          start_time: 'Sun, 11 Aug 2013 20:38:50 GMT',
        },
        {
          doc_write_failures: 0,
          docs_read: 1,
          docs_written: 1,
          end_last_seq: 1,
          end_time: 'Sat, 10 Aug 2013 15:41:54 GMT',
          missing_checked: 1,
          missing_found: 1,
          recorded_seq: 1,
          session_id: '6314f35c51de3ac408af79d6ee0c1a09',
          start_last_seq: 0,
          start_time: 'Sat, 10 Aug 2013 15:41:54 GMT',
        },
      ],
      ok: true,
      replication_id_version: 3,
      session_id: '142a35854a08e205c47174d91b1f9628',
      source_last_seq: 28,
    });
  });

  it('GET /_scheduler/jobs', () => {
    return api.get('/_scheduler/jobs').expect(200, {
      jobs: [],
      offset: 0,
      total_rows: 0,
    });
  });

  it('GET /_scheduler/docs', () => {
    return api.get('/_scheduler/docs').expect(200, {
      docs: [],
      offset: 0,
      total_rows: 0,
    });
  });

  it('GET /_scheduler/docs/{replicator_db}', () => {
    return api.get('/_scheduler/docs/replicator_db').expect(501, 'Not Yet Implemented');
  });

  it('GET /_scheduler/docs/{replicator_db}/{docid}', () => {
    return api.get('/_scheduler/docs/replicator_db/docid').expect(501, 'Not Yet Implemented');
  });

  it('GET /_node/{node-name}', () => {
    return api.get('/_node/_local').expect(200, {
      name: 'node1@127.0.0.1',
    });
  });

  it('GET /_node/{node-name}/_stats', () => {
    return api.get('/_node/_local/_stats/couchdb/request_time').expect(200, {
      value: {
        min: 0,
        max: 0,
        arithmetic_mean: 0,
        geometric_mean: 0,
        harmonic_mean: 0,
        median: 0,
        variance: 0,
        standard_deviation: 0,
        skewness: 0,
        kurtosis: 0,
        percentile: [
          [
            50,
            0,
          ],
          [
            75,
            0,
          ],
          [
            90,
            0,
          ],
          [
            95,
            0,
          ],
          [
            99,
            0,
          ],
          [
            999,
            0,
          ],
        ],
        histogram: [
          [
            0,
            0,
          ],
        ],
        n: 0,
      },
      type: 'histogram',
      desc: 'length of a request inside CouchDB without MochiWeb',
    });
  });

  it('GET /_node/{node-name}/_system', () => {
    return api.get('/_node/_local/_system').expect(501, 'Not Yet Implemented');
  });

  it('POST /_node/{node-name}/_restart', () => {
    return api.post('/_node/_local/_restart').expect(200);
  });

  it('POST /_search_analyze', () => {
    return api.post('/_search_analyze').expect(200, {
      tokens: ['run'],
    });
  });

  it('GET /_utils', () => {
    return api.get('/_utils').expect(301).then(({ headers }) => {
      expect(headers.location).toBe('/_utils/');
    });
  });

  it('GET /_utils/', () => {
    return api.get('/_utils/').expect(200);
  });

  it('GET /_up', () => {
    return api.get('/_up').expect(200, { status: 'ok' });
  });

  it('GET /_uuids', () => {
    return api.get('/_uuids?count=1').expect(200).then(({ body }) => {
      expect(Object.keys(body)).toEqual(['uuids']);
      expect(body.uuids).toBeInstanceOf(Array);
      expect(body.uuids.length).toBe(1);
    });
  });

  it('GET /favicon.ico', () => {
    return api.get('/favicon.ico').expect(404);
  });

  it('GET /_reshard', () => {
    return api.get('/_reshard').expect(200, {
      completed: 21,
      failed: 0,
      running: 3,
      state: 'running',
      state_reason: null,
      stopped: 0,
      total: 24,
    });
  });

  it('GET /_reshard/state', () => {
    return api.get('/_reshard/state').expect(200, {
      reason: null,
      state: 'running',
    });
  });

  it('PUT /_reshard/state', () => {
    return api.put('/_reshard/state').expect(200, { ok: true });
  });

  it('GET /_reshard/jobs', () => {
    return api.get('/_reshard/jobs').expect(200, {
      jobs: [],
      offset: 0,
      total_rows: 0,
    });
  });

  it('GET /_reshard/jobs/{jobid}', () => {
    return api.get('/_reshard/jobs/001').expect(200);
  });

  it('POST /_reshard/jobs', () => {
    return api.post('/_reshard/jobs').expect(201);
  });

  it('DELETE /_reshard/jobs/{jobid}', () => {
    return api.delete('/_reshard/jobs/001').expect(200, { ok: true });
  });

  it('GET /_reshard/jobs/{jobid}/state', () => {
    return api.get('/_reshard/jobs/001/state').expect(200, {
      reason: null,
      state: 'running',
    });
  });

  it('PUT /_reshard/jobs/{jobid}/state', () => {
    return api.put('/_reshard/jobs/001/state').expect(200, { ok: true });
  });
});
