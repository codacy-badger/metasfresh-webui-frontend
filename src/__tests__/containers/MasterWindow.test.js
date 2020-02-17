import React from "react";
import * as Immutable from "immutable";
import { mount, shallow, render } from "enzyme";
import nock from 'nock';
import uuid from "uuid/v4";
import { Provider } from 'react-redux';
import { applyMiddleware, createStore, compose, combineReducers } from 'redux';
import configureStore from 'redux-mock-store';
import { routerReducer as routing } from 'react-router-redux';
import { createMemoryHistory } from 'react-router';
import merge from 'merge';
import thunk from 'redux-thunk';
import promiseMiddleware from 'redux-promise';
import { WebSocket, Server } from 'mock-socket';
import waitForExpect from 'wait-for-expect';

import { ShortcutProvider } from '../../components/keyshortcuts/ShortcutProvider';
import CustomRouter from '../../containers/CustomRouter';

import pluginsHandler, { initialState as pluginsHandlerState } from '../../reducers/pluginsHandler';
import appHandler, { initialState as appHandlerState } from '../../reducers/appHandler';
import windowHandler, { initialState as windowHandlerState } from '../../reducers/windowHandler';
import menuHandler, { initialState as menuHandlerState } from '../../reducers/menuHandler';
import listHandler, { initialState as listHandlerState } from '../../reducers/listHandler';

import fixtures from "../../../test_setup/fixtures/master_window.json";
import dataFixtures from '../../../test_setup/fixtures/master_window/data.json';
import layoutFixtures from '../../../test_setup/fixtures/master_window/layout.json';
import rowFixtures from '../../../test_setup/fixtures/master_window/row_data.json';
import docActionFixtures from '../../../test_setup/fixtures/master_window/doc_action.json';
import userSessionData from '../../../test_setup/fixtures/user_session.json';
import notificationsData from '../../../test_setup/fixtures/notifications.json';

import MasterWindow from "../../containers/MasterWindow";

const mockStore = configureStore(middleware);
const middleware = [thunk, promiseMiddleware];
const FIXTURES_PROPS = fixtures.props1;
const history = createMemoryHistory('/window/143/1000000');

localStorage.setItem('isLogged', true)

const createInitialProps = function(additionalProps = {}) {
  return {
    ...FIXTURES_PROPS,
    ...additionalProps,
  };
};

const rootReducer = combineReducers({
  appHandler,
  listHandler,
  menuHandler,
  windowHandler,
  pluginsHandler,
  routing,
});

const createInitialState = function(state = {}) {
  const res = merge.recursive(
    true,
    {
      appHandler: { ...appHandlerState },
      windowHandler: { ...windowHandlerState },
      listHandler: { ...listHandlerState },
      menuHandler: { ...menuHandlerState },
      pluginsHandler: { ...pluginsHandlerState },
      routing: { ...fixtures.state1.routing },
    },
    state
  );

  return res;
}

describe("MasterWindowContainer", () => {
  describe("'integration' tests:", () => {
    it.skip("renders without errors", async done => {
      const initialState = createInitialState();
      const store = createStore(
        rootReducer,
        initialState,
        applyMiddleware(...middleware),
      );
      const initialProps = createInitialProps();
      const windowType = FIXTURES_PROPS.params.windowType;
      const docId = FIXTURES_PROPS.params.docId;
      const tabId = layoutFixtures.layout1.tabs[0].tabId;
      const auth = {
        initNotificationClient: jest.fn(),
        initSessionClient: jest.fn(),
      };

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/`)
        .reply(200, dataFixtures.data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/layout`)
        .reply(200, layoutFixtures.layout1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get('/userSession')
        .reply(200, userSessionData);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/notifications/websocketEndpoint`)
        .reply(200, `/notifications/${userSessionData.userProfileId}`);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get('/notifications/all?limit=20')
        .reply(200, notificationsData.data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/${tabId}/`)
        .reply(200, rowFixtures.row_data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/${tabId}/?orderBy=+Line`)
        .reply(200, rowFixtures.row_data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/field/DocAction/dropdown`)
        .reply(200, docActionFixtures.data1);

      const wrapper = mount(
        <Provider store={store}>
          <ShortcutProvider hotkeys={{}} keymap={{}} >
            <CustomRouter history={history} auth={auth}>
              <MasterWindow {...initialProps} />
            </CustomRouter>
          </ShortcutProvider>
        </Provider>
      );

      await waitForExpect(() => {
        wrapper.update();
        wrapper.update();

        const html = wrapper.html();
        expect(html).toContain('<table');

        done();
      }, 8000);
    }, 10000);

    it("renders without errors", async done => {
      const initialState = createInitialState();
      const store = createStore(
        rootReducer,
        initialState,
        applyMiddleware(...middleware),
      );
      const initialProps = createInitialProps();
      const windowType = FIXTURES_PROPS.params.windowType;
      const docId = FIXTURES_PROPS.params.docId;
      const tabId = layoutFixtures.layout1.tabs[0].tabId;
      const auth = {
        initNotificationClient: jest.fn(),
        initSessionClient: jest.fn(),
      };

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/`)
        .reply(200, dataFixtures.data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/layout`)
        .reply(200, layoutFixtures.layout1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get('/userSession')
        .reply(200, userSessionData);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/notifications/websocketEndpoint`)
        .reply(200, `/notifications/${userSessionData.userProfileId}`);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get('/notifications/all?limit=20')
        .reply(200, notificationsData.data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/${tabId}/`)
        .reply(200, rowFixtures.row_data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/${tabId}/?orderBy=+Line`)
        .reply(200, rowFixtures.row_data1);

      nock(config.API_URL)
        .defaultReplyHeaders({ 'access-control-allow-origin': '*' })
        .get(`/window/${windowType}/${docId}/field/DocAction/dropdown`)
        .reply(200, docActionFixtures.data1);

      const mockServer = new Server(config.WS_URL);
      // console.log('SERVER: ', config.WS_URL)
     
      mockServer.on('connection', socket => {
        console.log('server connected')
        socket.on('message', data => {
          console.log('ONMESSAGE: ', data)
          // t.is(data, 'test message from app', 'we have intercepted the message and can assert on it');
          socket.send('test message from mock server');
        });
        // socket.on('close', () => { console.log('closing')});
      });

      const wrapper = mount(
        <Provider store={store}>
          <ShortcutProvider hotkeys={{}} keymap={{}} >
            <CustomRouter history={history} auth={auth}>
              <MasterWindow {...initialProps} />
            </CustomRouter>
          </ShortcutProvider>
        </Provider>
      );

        console.log('CLIENTS: ', mockServer.clients()); // array of all connected clients
        mockServer.emit('/document/143/1000000', 'message');


      // mockServer.clients();

      await waitForExpect(() => {
        wrapper.update();
        wrapper.update();

        // console.log('CLIENTS: ', mockServer.clients()); // array of all connected clients
        mockServer.emit('/document/143/1000000', 'message');

        // setTimeout(() => {
        const html = wrapper.html();
        expect(html).toContain('<table');
      // }, 500);

        mockServer.stop(done);
        // done();
      }, 8000);
    }, 10000);
  });
});
