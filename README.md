# Fake CouchDB Testing Tool

A fake CouchDB server for testing.

[![npm](https://img.shields.io/npm/v/fakecouch.svg)](https://www.npmjs.com/package/fakecouch)
[![Build status](https://gitlab.com/demsking/fakecouch/badges/master/pipeline.svg)](https://gitlab.com/demsking/fakecouch/pipelines)
[![Test coverage](https://gitlab.com/demsking/fakecouch/badges/master/coverage.svg)](https://gitlab.com/demsking/fakecouch/pipelines)

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
  logger: false
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

## License

Under the MIT license.
See [LICENSE](https://gitlab.com/demsking/fakecouch/blob/master/LICENSE) file
for more details.
