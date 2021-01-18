# Fake CouchDB Testing Tool

A fake CouchDB server for testing.

[![npm](https://img.shields.io/npm/v/fakecouch.svg)](https://www.npmjs.com/package/fakecouch)
[![Build status](https://gitlab.com/demsking/fakecouch/badges/master/pipeline.svg)](https://gitlab.com/demsking/fakecouch/pipelines)
[![Test coverage](https://gitlab.com/demsking/fakecouch/badges/master/coverage.svg)](https://gitlab.com/demsking/fakecouch/pipelines)
[![Buy me a beer](https://img.shields.io/badge/Buy%20me-a%20beer-1f425f.svg)](https://www.buymeacoffee.com/demsking)

> **Disclaimer**: This is a fake CouchDB server which implements endpoints
  used in common applications. It does not claim to be use as a regular
  CouchDB server. It uses some static data as result for some database
  requests.

## Install

```sh
npm install -D fakecouch
```

## Usage

```js
const supertest = require('supertest');
const FakeCouchServer = require('fakecouch');

const couch = new FakeCouchServer({
  port: 5984,
  logger: false,
});

const api = supertest('<endpoint of my awesome API server>');

describe('My Awesome API Tests', () => {
  beforeAll(() => {
    couch.setup();
    couch.authenticate();
  });

  afterAll(() => couch.reset());

  it('HEAD /api/awesome/resource', () => {
    return api.head('/api/awesome/resource').expect(404)
      .then(() => api.put('/api/awesome/resource').expect(201))
      .then(() => api.head('/api/awesome/resource').expect(200));
  });
});
```

**Enable CORS using `options.headers`**

```js
const FakeCouchServer = require('fakecouch');

const couch = new FakeCouchServer({
  port: 5984,
  logger: false,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
  },
});
```

## Fake CouchDB API

```ts
type Options = {
  port?: number;
  logger?: boolean;
  headers?: Record<string, string>;
};

declare class Server {
  readonly serveUrl: string;
  readonly serverPort: number;
  readonly headers: Record<string, string>;
  readonly databases: Record<string, IFakeCouch.Database>;

  constructor({ port = 5984, logger = false }: Options);

  setup(): void;
  reset(): void;
  authenticate(): void;
  addDatabase(dbname: string): IFakeCouch.Database;
}

declare class Database {
  readonly name: string;
  readonly docs: Record<string, IFakeCouch.DocumentRef>;
  readonly localDocs: Record<string, IFakeCouch.DocumentRef>;
  readonly designs: Record<string, IFakeCouch.DocumentRef>;
  readonly indexes: IFakeCouch.IndexDefinition[];
  readonly security: Record<'admins' | 'members', IFakeCouch.SecurityObject>;
  readonly revisionLimit: number;

  addDoc(doc: Document, docid?: string): IFakeCouch.DocumentRef;
  addDocs(docs: Document[]): void;

  addIndex(index: Index): IFakeCouch.IndexDefinition;
  deleteIndex(ddoc: string, indexName: string): boolean;

  addDesign(ddoc: IFakeCouch.DesignDocument): IFakeCouch.DocumentRef;
  hasDesign(ddocid: string): boolean;
  deleteDesign(ddocid: string): void;
}
```

See [typings/IFakeCouch.d.ts](https://gitlab.com/demsking/fakecouch/blob/master/typings/IFakeCouch.d.ts)
for the comple API interfaces.

## License

Under the MIT license.
See [LICENSE](https://gitlab.com/demsking/fakecouch/blob/master/LICENSE) file
for more details.
