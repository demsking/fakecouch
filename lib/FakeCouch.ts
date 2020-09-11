/* eslint-disable no-console */
/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */

const express = require('express');
const bodyParser = require('body-parser');
const pkg = require('../package.json');

import { Application, Response, Request, Router } from 'express';
import { v4 as uuid } from 'uuid';
import { Server } from 'http';
import { IFakeCouch } from '../typings/IFakeCouch';
import FakeDatabase from './FakeDatabase';

const sendResponse = (res: Response, code: number, body?: any, headers?: IFakeCouch.Headers) => {
  res.status(code);

  res.set({
    'Cache-Control': 'must-revalidate',
    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
    Server: 'CouchDB/3.1.0 (Erlang OTP/20)'
  });

  if (headers) {
    res.set(headers);
  }

  if (body) {
    res.send(body);
  }

  res.end();
};

function createScope(): { router: Router; scope: IFakeCouch.Scope; } {
  const router: any = express.Router({
    strict: true
  });

  const handler = (method: string) => (path: string, code: IFakeCouch.ReplyFunction | [Function, IFakeCouch.ReplyFunction] | number, body?: any, headers?: IFakeCouch.Headers): IFakeCouch.Scope => {
    const middlewares: Function[] = [
      bodyParser.json()
    ];

    if (code instanceof Array) {
      middlewares.splice(0);
      middlewares.push(code[0]);

      code = code[1];
    }

    if (typeof code === 'function') {
      middlewares.push((req: Request, res: Response) => {
        const [responseCode, responseBody, responseHeaders] = (code as Function)(req);

        sendResponse(res, responseCode, responseBody, responseHeaders);
      });
    } else {
      middlewares.push((req: Request, res: Response) => sendResponse(res, code as number, body, headers));
    }

    router[method](path, middlewares);

    return scope;
  };

  const scope: IFakeCouch.Scope = {
    head: handler('head'),
    get: handler('get'),
    post: handler('post'),
    put: handler('put'),
    delete: handler('delete'),
    copy: handler('copy')
  };

  return { router, scope };
}

export default class FakeCouchServer implements IFakeCouch.Server {
  serverPort: number;
  serveUrl: string;
  databases: Record<string, FakeDatabase> = {};
  server?: Server;
  logger = false;
  scope!: IFakeCouch.Scope;
  app!: Application;

  constructor({ port = 5984, logger = false }: IFakeCouch.Options) {
    this.serverPort = port;
    this.serveUrl = `http://localhost:${port}`;
    this.logger = logger;
    this.app = express();

    this.app.set('x-powered-by', true);
    this.app.set('strict routing', true);

    if (this.logger) {
      this.app.use(require('morgan')('dev'));
    }

    this.mock();
  }

  addDatabase(dbname: string): FakeDatabase {
    if (!this.databases.hasOwnProperty(dbname)) {
      this.databases[dbname] = new FakeDatabase(dbname);
    }

    return this.databases[dbname];
  }

  buildIndexes(): void {
    for (const dbname in this.databases) {
      this.databases[dbname].buildIndexes();
    }
  }

  mock(): void {
    const { scope, router } = createScope();

    this.scope = scope;

    this.mockServer();
    this.mockDesign();
    this.mockDocument();
    this.mockDatabase();

    this.app.use(router);
    this.app.use('*', (req, res) => res.status(501).send(`No implementation for ${req.method} ${req.url}`));

    this.app.use((err: Error, req: Request, res: Response, next: Function) => {
      console.error(err);
      res.status(501).send('Something broke!');
    });
  }

  setup(): void {
    this.reset();

    this.server = this.app.listen(this.serverPort);
  }

  reset(): void {
    for (const dbname in this.databases) {
      delete this.databases[dbname];
    }

    this.server?.close();

    this.server = undefined;
  }

  mockServer(): void {
    this.scope
      /**
       * GET /
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--
       */
      .get('/', 200, {
        couchdb: 'Welcome',
        uuid: uuid(),
        git_sha: 'ff0feea20',
        features: [
          'access-ready',
          'partitioned',
          'pluggable-storage-engines',
          'reshard',
          'scheduler'
        ],
        vendor: {
          name: pkg.author
        },
        version: '3.1.0'
      })
      .post('/_session', [bodyParser.urlencoded({ extended: false }), (req) => {
        if (req.body.name) {
          return [
            200,
            {
              ok: true,
              name: req.body.name,
              roles: [
                '_admin'
              ]
            },
            {
              AuthSession: '4f2493bfb74e5887effa9480cd7df538_c_eauoCcg2IgB2LabR9bHNxhkM; Version=1; Expires=Wed, 02-Sep-3000 06:33:37 GMT; Max-Age=600; Path=/; HttpOnly'
            }
          ];
        }

        return [401];
      }])
      /**
       * GET /_active_tasks
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_active_tasks
       */
      .get('/_active_tasks', 501, 'Not Yet Implemented')
      /**
       * GET /_all_dbs
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_all_dbs
       */
      .get('/_all_dbs', () => [200, Object.keys(this.databases)])
      /**
       * POST /_dbs_info
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_dbs_info
       */
      .post('/_dbs_info', (req) => [
        200,
        req.body.keys.map((dbname: string) => ({
          key: dbname,
          info: this.databases[dbname].info
        }))
      ])
      /**
       * GET /_cluster_setup
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_cluster_setup
       */
      .get('/_cluster_setup', 200, {
        state: 'cluster_disabled'
      })
      /**
       * POST /_cluster_setup
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_cluster_setup
       */
      .post('/_cluster_setup', 501, 'Not Yet Implemented')
      /**
       * GET /_db_updates
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_db_updates
       */
      .get('/_db_updates', 501, 'Not Yet Implemented')
      /**
       * GET /_membership
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_membership
       */
      .get('/_membership', 200, {
        all_nodes: [
          'node1@127.0.0.1'
        ],
        cluster_nodes: [
          'node1@127.0.0.1'
        ]
      })
      /**
       * POST /_replicate
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_replicate
       */
      .post('/_replicate', 200, {
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
            start_time: 'Sun, 11 Aug 2013 20:38:50 GMT'
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
            start_time: 'Sat, 10 Aug 2013 15:41:54 GMT'
          }
        ],
        ok: true,
        replication_id_version: 3,
        session_id: '142a35854a08e205c47174d91b1f9628',
        source_last_seq: 28
      })
      /**
       * GET /_scheduler/jobs
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_scheduler-jobs
       */
      .get('/_scheduler/jobs', 200, {
        jobs: [],
        offset: 0,
        total_rows: 0
      })
      /**
       * GET /_scheduler/docs
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_scheduler-docs
       */
      .get('/_scheduler/docs', 200, {
        docs: [],
        offset: 0,
        total_rows: 0
      })
      /**
       * GET /_scheduler/docs/{replicator_db}
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_scheduler-docs-replicator_db
       */
      .get('/_scheduler/docs/:replicator_db', 501, 'Not Yet Implemented')
      /**
       * GET /_scheduler/docs/{replicator_db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_scheduler-docs-replicator_db-docid
       */
      .get('/_scheduler/docs/:replicator_db/:docid', 501, 'Not Yet Implemented')
      /**
       * GET /_node/{node-name}
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_node-node-name
       */
      .get('/_node/_local', 200, { name: 'node1@127.0.0.1' })
      /**
       * GET /_node/{node-name}/_stats
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_node-node-name-_stats
       */
      .get('/_node/_local/_stats/couchdb/request_time', 200, {
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
              0
            ],
            [
              75,
              0
            ],
            [
              90,
              0
            ],
            [
              95,
              0
            ],
            [
              99,
              0
            ],
            [
              999,
              0
            ]
          ],
          histogram: [
            [
              0,
              0
            ]
          ],
          n: 0
        },
        type: 'histogram',
        desc: 'length of a request inside CouchDB without MochiWeb'
      })
      /**
       * GET /_node/{node-name}/_system
       * @sse https://docs.couchdb.org/en/latest/api/server/common.html#get--_node-node-name-_system
       */
      .get('/_node/_local/_system', 501, 'Not Yet Implemented')
      /**
       * POST /_node/{node-name}/_restart
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_node-node-name-_restart
       */
      .post('/_node/:nodename/_restart', 200)
      /**
       * POST /_search_analyze
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_search_analyze
       */
      .post('/_search_analyze', 200, {
        tokens: ['run']
      })
      /**
       * GET /_utils
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_utils
       */
      .get('/_utils', 301, undefined, {
        Location: '/_utils/'
      })
      /**
       * GET /_utils/
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_utils-
       */
      .get('/_utils/', 200)
      /**
       * GET /_up
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_up
       */
      .get('/_up', 200, { status: 'ok' })
      /**
       * GET /_uuids
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_uuids
       */
      .get('/_uuids', (req) => [
        200,
        {
          uuids: new Array(req.query.count).fill(null).map(() => uuid())
        }
      ])
      /**
       * GET /favicon.ico
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--favicon.ico
       */
      .get('/favicon.ico', 404)
      /**
       * GET /_reshard
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_reshard
       */
      .get('/_reshard', 200, {
        completed: 21,
        failed: 0,
        running: 3,
        state: 'running',
        state_reason: null,
        stopped: 0,
        total: 24
      })
      /**
       * GET /_reshard/state
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_reshard-state
       */
      .get('/_reshard/state', 200, {
        reason: null,
        state: 'running'
      })
      /**
       * PUT /_reshard/state
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#put--_reshard-state
       */
      .put('/_reshard/state', 200, { ok: true })
      /**
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_reshard-jobs
       */
      .get('/_reshard/jobs', 200, {
        jobs: [],
        offset: 0,
        total_rows: 0
      })
      /**
       * GET /_reshard/jobs/{jobid}
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_reshard-jobs-jobid
       */
      .get('/_reshard/jobs/:jobid', (req) => [
        200,
        {
          id: req.params.jobid,
          job_state: 'completed',
          node: 'node1@127.0.0.1',
          source: 'shards/00000000-1fffffff/d1.1553786862',
          split_state: 'completed',
          start_time: '2019-03-28T15:28:02Z',
          state_info: {},
          target: [
            'shards/00000000-0fffffff/d1.1553786862',
            'shards/10000000-1fffffff/d1.1553786862'
          ],
          type: 'split',
          update_time: '2019-03-28T15:28:08Z',
          history: [
            {
              detail: null,
              timestamp: '2019-03-28T15:28:02Z',
              type: 'new'
            },
            {
              detail: 'initial_copy',
              timestamp: '2019-03-28T15:28:02Z',
              type: 'running'
            }
          ]
        }
      ])
      /**
       * POST /_reshard/jobs
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#post--_reshard-jobs
       */
      .post('/_reshard/jobs', 201, [
        {
          id: '001-30d7848a6feeb826d5e3ea5bb7773d672af226fd34fd84a8fb1ca736285df557',
          node: 'node1@127.0.0.1',
          ok: true,
          shard: 'shards/80000000-ffffffff/db3.1554148353'
        },
        {
          id: '001-c2d734360b4cb3ff8b3feaccb2d787bf81ce2e773489eddd985ddd01d9de8e01',
          node: 'node2@127.0.0.1',
          ok: true,
          shard: 'shards/80000000-ffffffff/db3.1554148353'
        }
      ])
      /**
       * DELETE /_reshard/jobs/{jobid}
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#delete--_reshard-jobs-jobid
       */
      .delete('/_reshard/jobs/:jobid', 200, { ok: true })
      /**
       * GET /_reshard/jobs/{jobid}/state
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#get--_reshard-jobs-jobid-state
       */
      .get('/_reshard/jobs/:jobid/state', 200, {
        reason: null,
        state: 'running'
      })
      /**
       * PUT /_reshard/jobs/{jobid}/state
       * @see https://docs.couchdb.org/en/latest/api/server/common.html#put--_reshard-jobs-jobid-state
       */
      .put('/_reshard/jobs/:jobid/state', 200, { ok: true });
  }

  handleDatabaseRequest(req: Request, handler: (db: FakeDatabase) => IFakeCouch.ReplyFunctionReturns): IFakeCouch.ReplyFunctionReturns {
    if (this.databases.hasOwnProperty(req.params.dbname)) {
      const db = this.databases[req.params.dbname];

      return handler(db);
    }

    return [
      404,
      {
        error: 'not_found',
        reason: 'Database does not exist.'
      }
    ];
  }

  mockDatabase(): void {
    this.scope
      .head('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => [200]))
      .get('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => [200, db.info]))
      .post('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => {
        if (req.body._id) {
          if (db.docs.hasOwnProperty(req.body._id)) {
            return [
              409,
              {
                error: 'duplicate',
                reason: 'A Conflicting Document with same ID already exists'
              }
            ];
          }
        }

        const doc = db.addDoc(req.body);

        return [
          201,
          {
            id: doc._id,
            ok: true,
            rev: doc._rev
          },
          {
            Location: `${this.serveUrl}/${db.name}/${doc._id}`
          }
        ];
      }))
      .put('/:dbname', (req) => {
        if (this.databases.hasOwnProperty(req.params.dbname)) {
          return [
            412,
            {
              error: 'file_exists',
              reason: 'The database could not be created, the file already exists.'
            }
          ];
        }

        this.addDatabase(req.params.dbname);

        return [
          201,
          { ok: true }
        ];
      })
      .delete('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => {
        delete this.databases[db.name];

        return [
          200,
          { ok: true }
        ];
      }))
      .get('/:dbname/_all_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const docs = Object.values(db.docs);

        return [
          200,
          {
            offset: 0,
            rows: docs,
            total_rows: docs.length
          }
        ];
      }))
      .post('/:dbname/_all_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const docs = Object.values(db.docs);
        const result = req.body.keys.map((key: string) => db.docs[key]).map((doc: Record<string, any>) => ({
          value: {
            rev: doc._rev
          },
          id: doc._id,
          key: doc._id
        }));

        return [
          200,
          {
            offset: 0,
            rows: result,
            total_rows: docs.length
          }
        ];
      }))
      .get('/:dbname/_design_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const docs = Object.values(db.designs);

        return [
          200,
          {
            offset: 0,
            rows: docs,
            total_rows: docs.length
          }
        ];
      }))
      .post('/:dbname/_design_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const docs = Object.values(db.designs);
        const result = req.body.keys.map((key: string) => db.designs[key]).map((doc: Record<string, any>) => ({
          value: {
            rev: doc._rev
          },
          id: doc._id,
          key: doc._id
        }));

        return [
          200,
          {
            offset: 0,
            rows: result,
            total_rows: docs.length
          }
        ];
      }))
      .post('/:dbname/_all_docs/queries', (req) => this.handleDatabaseRequest(req, (db) => [501, 'Not Yet Implemented']))
      .post('/:dbname/_bulk_get', (req) => this.handleDatabaseRequest(req, (db) => {
        const result = req.body.docs.map(({ id }: any) => db.docs[id]).map((doc: Record<string, any>) => ({
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
                    doc._rev.spli('-')[1]
                  ]
                }
              }
            }
          ]
        }));

        return [
          200,
          { result }
        ];
      }))
      .post('/:dbname/_bulk_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const result = req.body.docs.map((doc: any) => db._addDoc(doc)).map((doc: Record<string, any>) => ({
          ok: true,
          id: doc._id,
          rev: doc._rev
        }));

        this.buildIndexes();

        return [
          201,
          { result }
        ];
      }))
      /**
       * POST /{db}/_find
       * @see https://docs.couchdb.org/en/latest/api/database/find.html#post--db-_find
       */
      .post('/:dbname/_find', (req) => this.handleDatabaseRequest(req, (db) => {
        if (!req.body.selector) {
          return [400];
        }

        return [200, db.find(req.body)];
      }))
      /**
       * POST /{db}/_index
       * @see https://docs.couchdb.org/en/latest/api/database/find.html#db-index
       */
      .post('/:dbname/_index', (req) => this.handleDatabaseRequest(req, (db) => {
        if (!req.body.index) {
          return [400];
        }

        return [
          200,
          {
            result: 'created',
            id: `_design/${req.body.ddoc || uuid()}`,
            name: req.body.name || uuid()
          }
        ];
      }))
      /**
       * POST /{db}/_explain
       * @see https://docs.couchdb.org/en/latest/api/database/find.html#db-explain
       */
      .post('/:dbname/_explain', (req) => this.handleDatabaseRequest(req, (db) => {
        return [
          501,
          'Not Yet Implemented'
        ];
      }))
      /**
       * GET /{db}/_shards
       * @see https://docs.couchdb.org/en/latest/api/database/shard.html#get--db-_shards
       */
      .get('/:dbname/_shards', (req) => this.handleDatabaseRequest(req, (db) => [200, {
        shards: {
          '00000000-1fffffff': [
            'couchdb@node1.example.com'
          ],
          '20000000-3fffffff': [
            'couchdb@node1.example.com'
          ]
        }
      }]))
      /**
       * GET /{db}/_shards/{docid}
       * @see https://docs.couchdb.org/en/latest/api/database/shard.html#db-shards-doc
       */
      .get('/:dbname/_shards/:docid', (req) => this.handleDatabaseRequest(req, (db) => [200, {
        range: 'e0000000-ffffffff',
        nodes: [
          'node1@127.0.0.1'
        ]
      }]))
      /**
       * POST /{db}/_sync_shards
       * @see https://docs.couchdb.org/en/latest/api/database/shard.html#db-sync-shards
       */
      .post('/:dbname/_sync_shards', (req) => this.handleDatabaseRequest(req, (db) => [200, {
        ok: true
      }]))
      /**
       * GET /{db}/_changes
       * @see https://docs.couchdb.org/en/latest/api/database/changes.html
       */
      .get('/:dbname/_changes', (req) => this.handleDatabaseRequest(req, (db) => {
        return [
          501,
          'Not Yet Implemented'
        ];
      }))
      /**
       * POST /{db}/_compact
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html
       */
      .post('/:dbname/_compact', (req) => this.handleDatabaseRequest(req, (db) => [202, {
        ok: true
      }]))
      /**
       * POST /{db}/_compact/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-compact-design-doc
       */
      .post('/:dbname/_compact/:ddoc', (req) => this.handleDatabaseRequest(req, (db) => [202, {
        ok: true
      }]))
      /**
       * POST /{db}/_ensure_full_commit
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-ensure-full-commit
       */
      .post('/:dbname/_ensure_full_commit', (req) => this.handleDatabaseRequest(req, (db) => [202, {
        ok: true,
        instance_start_time: '0'
      }]))
      /**
       * POST /{db}/_view_cleanup
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-view-cleanup
       */
      .post('/:dbname/_view_cleanup', (req) => this.handleDatabaseRequest(req, (db) => [202, { ok: true }]))
      /**
       * GET /{db}/_security
       * @see https://docs.couchdb.org/en/latest/api/database/security.html
       */
      .get('/:dbname/_security', (req) => this.handleDatabaseRequest(req, (db) => [200, db.security]))
      /**
       * PUT /{db}/_security
       * @see https://docs.couchdb.org/en/latest/api/database/security.html#put--db-_security
       */
      .put('/:dbname/_security', (req) => this.handleDatabaseRequest(req, (db) => {
        Object.assign(db.security, req.body);

        return [
          200,
          { ok: true }
        ];
      }))
      /**
       * POST /{db}/_purge
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#db-purge
       */
      .post('/:dbname/_purge', (req) => this.handleDatabaseRequest(req, (db) => {
        const result = {
          purge_seq: null,
          purged: {} as any
        };

        for (const _id in req.body) {
          result.purged[_id] = [
            req.body[_id].pop()
          ];
        }

        return [
          201,
          result
        ];
      }))
      /**
       * GET /{db}/_purged_infos_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#get--db-_purged_infos_limit
       */
      .get('/:dbname/_purged_infos_limit', (req) => this.handleDatabaseRequest(req, (db) => [200, '1000']))
      /**
       * PUT /{db}/_purged_infos_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#put--db-_purged_infos_limit
       */
      .put('/:dbname/_purged_infos_limit', (req) => this.handleDatabaseRequest(req, (db) => [200, { ok: true }]))
      /**
       * POST /{db}/_missing_revs
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#db-missing-revs
       */
      .post('/:dbname/_missing_revs', (req) => this.handleDatabaseRequest(req, (db) => {
        const result = {
          missing_revs: {} as any
        };

        for (const _id in req.body) {
          result.missing_revs[_id] = [
            req.body[_id].shift()
          ];
        }

        return [
          200,
          result
        ];
      }))
      /**
       * POST /{db}/_revs_diff
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#db-revs-diff
       */
      .post('/:dbname/_revs_diff', (req) => this.handleDatabaseRequest(req, (db) => {
        return [
          501,
          'Not Yet Implemented'
        ];
      }))
      /**
       * GET /{db}/_revs_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#db-revs-limit
       */
      .get('/:dbname/_revs_limit', (req) => this.handleDatabaseRequest(req, (db) => [200, '1000']))
      /**
       * PUT /{db}/_revs_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#put--db-_revs_limit
       */
      .get('/:dbname/_revs_limit', (req) => this.handleDatabaseRequest(req, (db) => [200, { ok: true }]))
      /**
       * GET /{db}/_local_docs
       * @see https://docs.couchdb.org/en/latest/api/local.html#get--db-_local_docs
       */
      .get('/:dbname/_local_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const docs = Object.values(db.localDocs);

        return [
          200,
          {
            offset: 0,
            rows: docs,
            total_rows: docs.length
          }
        ];
      }))
      /**
       * POST /{db}/_local_docs
       * @see https://docs.couchdb.org/en/latest/api/local.html#post--db-_local_docs
       */
      .post('/:dbname/_all_docs', (req) => this.handleDatabaseRequest(req, (db) => {
        const result = req.body.keys.map((key: string) => db.localDocs[key]).map((doc: Record<string, any>) => ({
          value: {
            rev: doc._rev
          },
          id: doc._id,
          key: doc._id
        }));

        return [
          200,
          {
            offset: null,
            rows: result,
            total_rows: null
          }
        ];
      }));
  }

  mockDocument(): void {
    this.scope
      /**
       * HEAD /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#head--db-docid
       */
      .head('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          return [200];
        }

        return [404];
      }))
      /**
       * GET /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
       */
      .get('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          return [200, db.docs[req.params.docid]];
        }

        return [404];
      }))
      /**
       * PUT /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
       */
      .put('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          return [409];
        }

        const doc = db.addDoc(req.body, req.params.docid);

        return [
          200,
          {
            ok: true,
            id: doc._id,
            rev: doc._rev
          }
        ];
      }))
      /**
       * DELETE /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#delete--db-docid
       */
      .delete('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          db.docs[req.params.docid]._deleted = true;

          const doc = db.addDoc(db.docs[req.params.docid]);

          return [
            200,
            {
              ok: true,
              id: doc._id,
              rev: doc._rev
            }
          ];
        }

        return [404];
      }));
  }

  mockDesign(): void {
    this.scope
      .head('/:dbname/_design/:ddocname/_view/:viewname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddocid = `_design/${req.params.ddocname}`;
        const viewname = req.params.viewname;

        return db.hasDesignView(ddocid, viewname) ? [200] : [404];
      }))
      .get('/:dbname/_design/:ddocname/_view/:viewname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddocid = `_design/${req.params.ddocname}`;
        const viename = req.params.viewname;

        if (db.hasDesignView(ddocid, viename)) {
          return [
            200,
            db.getDesignView(ddocid, viename, req.query)
          ];
        }

        return [404];
      }))
      /**
       * HEAD /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#head--db-_design-ddoc
       */
      .head('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddoc = `_design/${req.params.ddocname}`;

        if (db.designs.hasOwnProperty(ddoc)) {
          return [200];
        }

        return [404];
      }))
      /**
       * GET /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#get--db-_design-ddoc
       */
      .get('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddoc = `_design/${req.params.ddocname}`;

        if (db.designs.hasOwnProperty(ddoc)) {
          return [200, db.designs[ddoc]];
        }

        return [404];
      }))
      /**
       * PUT /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#put--db-_design-ddoc
       */
      .put('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        if (req.body._id) {
          if (db.designs.hasOwnProperty(req.body._id)) {
            return [409];
          }

          const design = db.addDesign(req.body);

          return [
            200,
            {
              ok: true,
              id: design._id,
              rev: design._rev
            }
          ];
        }

        return [400];
      }))
      /**
       * DELETE /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#delete--db-_design-ddoc
       */
      .delete('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddoc = `_design/${req.params.ddocname}`;

        if (db.designs.hasOwnProperty(ddoc)) {
          const design = db.designs[ddoc];

          db.deleteDesign(ddoc);

          return [
            200,
            {
              ok: true,
              id: design._id,
              rev: design._rev
            }
          ];
        }

        return [404];
      }));
  }
}
