/* eslint-disable no-console */
/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */

const express = require('express');
const bodyParser = require('body-parser');

import { Application, Response, Request, Router } from 'express';
import { v4 as uuid } from 'uuid';
import { Server } from 'http';
import { IFakeCouch } from '../typings/IFakeCouch';
import FakeDatabase from './FakeDatabase';

const sendResponse = (res: Response, code: number, body?: any, headers?: IFakeCouch.Headers) => {
  res.status(code);

  res.set({
    'Cache-Control': 'must-revalidate',
    'Content-Type': 'application/json',
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
        const [ responseCode, responseBody, responseHeaders ] = (code as Function)(req);

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
          name: 'The Apache Software Foundation'
        },
        version: '3.1.0'
      })
      .post('/_session', [ bodyParser.urlencoded({ extended: false }), (req) => {
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

        return [ 401 ];
      } ])
      .get('/_active_tasks', 501, 'Not Yet Implemented')
      .get('/_all_dbs', 200, Object.keys(this.databases))
      .post('/_dbs_info', (req) => [
        200,
        req.body.keys.map((dbname: string) => ({
          key: dbname,
          info: this.databases[dbname].info
        }))
      ])
      .get('/_cluster_setup', 200, {
        state: 'cluster_disabled'
      })
      .post('/_cluster_setup', 501, 'Not Yet Implemented')
      .get('/_db_updates', 501, 'Not Yet Implemented')
      .get('/_membership', 200, {
        all_nodes: [
          'node1@127.0.0.1'
        ],
        cluster_nodes: [
          'node1@127.0.0.1'
        ]
      })
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
      .get('/_scheduler/jobs', 200, {
        jobs: [
          {
            database: '_replicator',
            doc_id: 'cdyno-0000001-0000003',
            history: [
              {
                timestamp: '2017-04-29T05:01:37Z',
                type: 'started'
              },
              {
                timestamp: '2017-04-29T05:01:37Z',
                type: 'added'
              }
            ],
            id: '8f5b1bd0be6f9166ccfd36fc8be8fc22+continuous',
            info: {
              changes_pending: 0,
              checkpointed_source_seq: '113-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE01ygQLsZsYGqcamiZjKcRqRxwIkGRqA1H-oSbZgk1KMLCzTDE0wdWUBAF6HJIQ',
              doc_write_failures: 0,
              docs_read: 113,
              docs_written: 113,
              missing_revisions_found: 113,
              revisions_checked: 113,
              source_seq: '113-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE01ygQLsZsYGqcamiZjKcRqRxwIkGRqA1H-oSbZgk1KMLCzTDE0wdWUBAF6HJIQ',
              through_seq: '113-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE01ygQLsZsYGqcamiZjKcRqRxwIkGRqA1H-oSbZgk1KMLCzTDE0wdWUBAF6HJIQ'
            },
            node: 'node1@127.0.0.1',
            pid: '<0.1850.0>',
            source: 'http://myserver.com/foo',
            start_time: '2017-04-29T05:01:37Z',
            target: 'http://adm:*****@localhost:15984/cdyno-0000003/',
            user: null
          },
          {
            database: '_replicator',
            doc_id: 'cdyno-0000001-0000002',
            history: [
              {
                timestamp: '2017-04-29T05:01:37Z',
                type: 'started'
              },
              {
                timestamp: '2017-04-29T05:01:37Z',
                type: 'added'
              }
            ],
            id: 'e327d79214831ca4c11550b4a453c9ba+continuous',
            info: {
              changes_pending: null,
              checkpointed_source_seq: 0,
              doc_write_failures: 0,
              docs_read: 12,
              docs_written: 12,
              missing_revisions_found: 12,
              revisions_checked: 12,
              source_seq: '12-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE1lzgQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSexgk4yMkhITjS0wdWUBADfEJBg',
              through_seq: '12-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE1lzgQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSexgk4yMkhITjS0wdWUBADfEJBg'
            },
            node: 'node2@127.0.0.1',
            pid: '<0.1757.0>',
            source: 'http://myserver.com/foo',
            start_time: '2017-04-29T05:01:37Z',
            target: 'http://adm:*****@localhost:15984/cdyno-0000002/',
            user: null
          }
        ],
        offset: 0,
        total_rows: 2
      })
      .get('/_scheduler/docs', 200, {
        docs: [
          {
            database: '_replicator',
            doc_id: 'cdyno-0000001-0000002',
            error_count: 0,
            id: 'e327d79214831ca4c11550b4a453c9ba+continuous',
            info: {
              changes_pending: 15,
              checkpointed_source_seq: '60-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYEyVygQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSSpgk4yMkhITjS0wdWUBAENCJEg',
              doc_write_failures: 0,
              docs_read: 67,
              docs_written: 67,
              missing_revisions_found: 67,
              revisions_checked: 67,
              source_seq: '67-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE2VygQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSepgk4yMkhITjS0wdWUBAEVKJE8',
              through_seq: '67-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE2VygQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSepgk4yMkhITjS0wdWUBAEVKJE8'
            },
            last_updated: '2017-04-29T05:01:37Z',
            node: 'node2@127.0.0.1',
            source_proxy: null,
            target_proxy: null,
            source: 'http://myserver.com/foo',
            start_time: '2017-04-29T05:01:37Z',
            state: 'running',
            target: 'http://adm:*****@localhost:15984/cdyno-0000002/'
          },
          {
            database: '_replicator',
            doc_id: 'cdyno-0000001-0000003',
            error_count: 0,
            id: '8f5b1bd0be6f9166ccfd36fc8be8fc22+continuous',
            info: {
              changes_pending: null,
              checkpointed_source_seq: 0,
              doc_write_failures: 0,
              docs_read: 12,
              docs_written: 12,
              missing_revisions_found: 12,
              revisions_checked: 12,
              source_seq: '12-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE1lzgQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSexgk4yMkhITjS0wdWUBADfEJBg',
              through_seq: '12-g1AAAACTeJzLYWBgYMpgTmHgz8tPSTV0MDQy1zMAQsMckEQiQ1L9____szKYE1lzgQLsBsZm5pZJJpjKcRqRxwIkGRqA1H-oSexgk4yMkhITjS0wdWUBADfEJBg'
            },
            last_updated: '2017-04-29T05:01:37Z',
            node: 'node1@127.0.0.1',
            source_proxy: null,
            target_proxy: null,
            source: 'http://myserver.com/foo',
            start_time: '2017-04-29T05:01:37Z',
            state: 'running',
            target: 'http://adm:*****@localhost:15984/cdyno-0000003/'
          }
        ],
        offset: 0,
        total_rows: 2
      })
      .get('/_scheduler/docs/{replicator_db}', 501, 'Not Yet Implemented')
      .get('/_scheduler/docs/{replicator_db}/{docid}', 501, 'Not Yet Implemented')
      .get('/_node/_local', 200, { name: 'node1@127.0.0.1' })
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
      .get('/_node/_local/_system', 501, 'Not Yet Implemented')
      .post(/\/_node\/.+\/_restart/, 200)
      .post('/_search_analyze', 200, {
        tokens: [ 'run' ]
      })
      .get('/_utils', 301, undefined, {
        Location: '/_utils/'
      })
      .get('/_utils/', 200)
      .get('/_up', 200, { status: 'ok' })
      .get('/_uuids', (req) => [
        200,
        {
          uuids: new Array(req.query.count).fill(null).map(() => uuid())
        }
      ])
      .get('/favicon.ico', 404)
      .get('/_reshard', 200, {
        completed: 21,
        failed: 0,
        running: 3,
        state: 'running',
        state_reason: null,
        stopped: 0,
        total: 24
      })
      .get('/_reshard/state', 200, {
        reason: null,
        state: 'running'
      })
      .put('/_reshard/state', 200, { ok: true })
      .get('/_reshard/jobs', 501, 'Not Yet Implemented')
      .get('/_reshard/jobs/:job', 501, 'Not Yet Implemented')
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
      .delete('/_reshard/jobs/:job', 200, { ok: true })
      .get('/_reshard/jobs/:job/state', 200, {
        reason: null,
        state: 'running'
      })
      .put('/_reshard/jobs/:job/state', 200, { ok: true });
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
      .head('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => [ 200 ]))
      .get('/:dbname', (req) => this.handleDatabaseRequest(req, (db) => [ 200, db.info ]))
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
      .post('/:dbname/_all_docs/queries', (req) => this.handleDatabaseRequest(req, (db) => [ 501, 'Not Yet Implemented' ]))
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
          return [ 400 ];
        }

        return [ 200, db.find(req.body) ];
      }))
      /**
       * POST /{db}/_index
       * @see https://docs.couchdb.org/en/latest/api/database/find.html#db-index
       */
      .post('/:dbname/_index', (req) => this.handleDatabaseRequest(req, (db) => {
        if (!req.body.index) {
          return [ 400 ];
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
      .get('/:dbname/_shards', (req) => this.handleDatabaseRequest(req, (db) => [ 200, {
        shards: {
          '00000000-1fffffff': [
            'couchdb@node1.example.com'
          ],
          '20000000-3fffffff': [
            'couchdb@node1.example.com'
          ]
        }
      } ]))
      /**
       * GET /{db}/_shards/{docid}
       * @see https://docs.couchdb.org/en/latest/api/database/shard.html#db-shards-doc
       */
      .get('/:dbname/_shards/:docid', (req) => this.handleDatabaseRequest(req, (db) => [ 200, {
        range: 'e0000000-ffffffff',
        nodes: [
          'node1@127.0.0.1'
        ]
      } ]))
      /**
       * POST /{db}/_sync_shards
       * @see https://docs.couchdb.org/en/latest/api/database/shard.html#db-sync-shards
       */
      .post('/:dbname/_sync_shards', (req) => this.handleDatabaseRequest(req, (db) => [ 200, {
        ok: true
      } ]))
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
      .post('/:dbname/_compact', (req) => this.handleDatabaseRequest(req, (db) => [ 202, {
        ok: true
      } ]))
      /**
       * POST /{db}/_compact/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-compact-design-doc
       */
      .post('/:dbname/_compact/:ddoc', (req) => this.handleDatabaseRequest(req, (db) => [ 202, {
        ok: true
      } ]))
      /**
       * POST /{db}/_ensure_full_commit
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-ensure-full-commit
       */
      .post('/:dbname/_ensure_full_commit', (req) => this.handleDatabaseRequest(req, (db) => [ 202, {
        ok: true,
        instance_start_time: '0'
      } ]))
      /**
       * POST /{db}/_view_cleanup
       * @see https://docs.couchdb.org/en/latest/api/database/compact.html#db-view-cleanup
       */
      .post('/:dbname/_view_cleanup', (req) => this.handleDatabaseRequest(req, (db) => [ 202, { ok: true } ]))
      /**
       * GET /{db}/_security
       * @see https://docs.couchdb.org/en/latest/api/database/security.html
       */
      .get('/:dbname/_security', (req) => this.handleDatabaseRequest(req, (db) => [ 200, db.security ]))
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
      .get('/:dbname/_purged_infos_limit', (req) => this.handleDatabaseRequest(req, (db) => [ 200, '1000' ]))
      /**
       * PUT /{db}/_purged_infos_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#put--db-_purged_infos_limit
       */
      .put('/:dbname/_purged_infos_limit', (req) => this.handleDatabaseRequest(req, (db) => [ 200, { ok: true } ]))
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
      .get('/:dbname/_revs_limit', (req) => this.handleDatabaseRequest(req, (db) => [ 200, '1000' ]))
      /**
       * PUT /{db}/_revs_limit
       * @see https://docs.couchdb.org/en/latest/api/database/misc.html#put--db-_revs_limit
       */
      .get('/:dbname/_revs_limit', (req) => this.handleDatabaseRequest(req, (db) => [ 200, { ok: true } ]))
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
          return [ 200 ];
        }

        return [ 404 ];
      }))
      /**
       * GET /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
       */
      .get('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          return [ 200, db.docs[req.params.docid] ];
        }

        return [ 404 ];
      }))
      /**
       * PUT /{db}/{docid}
       * @see https://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
       */
      .put('/:dbname/:docid', (req) => this.handleDatabaseRequest(req, (db) => {
        if (db.docs.hasOwnProperty(req.params.docid)) {
          return [ 409 ];
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

        return [ 404 ];
      }));
  }

  mockDesign(): void {
    this.scope
      .head('/:dbname/_design/:ddocname/_view/:viewname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddocid = `_design/${req.params.ddocname}`;
        const viewname = req.params.viewname;

        return db.hasDesignView(ddocid, viewname) ? [ 200 ] : [ 404 ];
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

        return [ 404 ];
      }))
      /**
       * HEAD /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#head--db-_design-ddoc
       */
      .head('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddoc = `_design/${req.params.ddocname}`;

        if (db.designs.hasOwnProperty(ddoc)) {
          return [ 200 ];
        }

        return [ 404 ];
      }))
      /**
       * GET /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#get--db-_design-ddoc
       */
      .get('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        const ddoc = `_design/${req.params.ddocname}`;

        if (db.designs.hasOwnProperty(ddoc)) {
          return [ 200, db.designs[ddoc] ];
        }

        return [ 404 ];
      }))
      /**
       * PUT /{db}/_design/{ddoc}
       * @see https://docs.couchdb.org/en/latest/api/ddoc/common.html#put--db-_design-ddoc
       */
      .put('/:dbname/_design/:ddocname', (req) => this.handleDatabaseRequest(req, (db) => {
        if (req.body._id) {
          if (db.designs.hasOwnProperty(req.body._id)) {
            return [ 409 ];
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

        return [ 400 ];
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

        return [ 404 ];
      }));
  }
}
