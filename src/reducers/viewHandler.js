import { Map } from 'immutable';

import {
  FETCH_DOCUMENT_PENDING,
  FETCH_DOCUMENT_SUCCESS,
  FETCH_DOCUMENT_ERROR,
  FETCH_LAYOUT_PENDING,
  FETCH_LAYOUT_SUCCESS,
  FETCH_LAYOUT_ERROR,
  CREATE_VIEW,
  CREATE_VIEW_SUCCESS,
  CREATE_VIEW_ERROR,
  FILTER_VIEW,
  FILTER_VIEW_SUCCESS,
  FILTER_VIEW_ERROR,
  UPDATE_VIEW_DATA,
  FETCH_LOCATION_CONFIG_SUCCESS,
  FETCH_LOCATION_CONFIG_ERROR,
  RESET_VIEW,
} from '../actions/ViewActions';

const initialState = {
  layout: {
    activeTab: null,
    data: [],
    pending: false,
    error: null,
    notfound: false,
  },
  // rowData is an immutable Map with tabId's as keys, and Lists as values.
  // List's elements are plain objects for now
  rowData: Map(),
  docId: undefined,
  type: null,
  viewId: null,
  windowId: null,
  filters: null,
  firstRow: 0,
  headerProperties: null,
  pageLength: 0,
  page: 1,
  size: 0,
  description: null,
  sort: null,
  staticFilters: null,
  orderBy: null,
  queryLimitHit: null,
  mapConfig: null,

  // columnsByFieldName: null,
  // websocket: null,
  // saveStatus: {},
  // validStatus: {},
  // includedTabsInfo: {},
  notfound: false,
  pending: false,
  error: null,
};

export default function viewHandler(state = initialState, action) {
  switch (action.type) {
    case FETCH_DOCUMENT_PENDING:
      return {
        ...state,
        notfound: false,
        pending: true,
        error: null,
      };
    case FETCH_DOCUMENT_SUCCESS: {
      // TODO: Maybe just use `omit` to remove `result` ?
      const {
        firstRow,
        headerProperties,
        pageLength,
        result,
        size,
        type,
        viewId,
        windowId,
        orderBy,
        queryLimit,
        queryLimitHit,
      } = action.payload;

      //WTF prettier?
      //eslint-disable-next-line
      const page = size > 1 ? (firstRow / pageLength) + 1 : 1;

      return {
        ...state,
        firstRow,
        headerProperties,
        pageLength,
        size,
        type,
        viewId,
        windowId,
        orderBy,
        page,
        queryLimit,
        queryLimitHit,
        rowData: Map({ [`${action.payload.tabId || 1}`]: result }),
        pending: false,
      };
    }
    case FETCH_DOCUMENT_ERROR:
      return {
        ...state,
        pending: false,
        notfound: true,
        error: action.error,
      };

    // LAYOUT
    case FETCH_LAYOUT_PENDING:
      return {
        ...state,
        layout: {
          ...state.layout,
          notfound: false,
          pending: true,
        },
      };
    case FETCH_LAYOUT_SUCCESS: {
      return {
        ...state,
        layout: {
          ...state.layout,
          ...action.payload,
          pending: false,
          error: null,
        },
      };
    }
    case FETCH_LAYOUT_ERROR:
      return {
        ...state,
        layout: {
          ...state.layout,
          notfound: true,
          pending: false,
          error: action.error,
        },
      };

    case CREATE_VIEW:
      return {
        ...state,
        pending: true,
        error: null,
      };
    case CREATE_VIEW_SUCCESS:
      return {
        ...state,
        viewId: action.payload.viewId,
        pending: false,
        notfound: false,
      };

    case CREATE_VIEW_ERROR:
      return {
        ...state,
        pending: false,
        notfound: true,
        error: action.error,
      };
    case FILTER_VIEW:
      return {
        ...state,
        notfound: false,
        pending: true,
        error: null,
      };
    case FILTER_VIEW_SUCCESS: {
      const { filters, viewId, size } = action.payload;

      return {
        ...state,
        filters,
        viewId,
        size,
        // TODO: Should we always set it to 1 ?
        page: 1,
        pending: false,
      };
    }
    case FILTER_VIEW_ERROR:
      return {
        ...state,
        pending: false,
        notfound: true,
        error: action.error,
      };

    case UPDATE_VIEW_DATA: {
      const tabId = action.payload.tabId || '1';
      const updatedRowsData = state.rowData.set(tabId, action.payload.rows);

      return {
        ...state,
        rowData: updatedRowsData,
      };
    }

    case FETCH_LOCATION_CONFIG_SUCCESS: {
      const { payload } = action;

      if (payload.data.provider === 'GoogleMaps') {
        return {
          ...state,
          mapConfig: payload.data,
        };
      }

      return state;
    }
    case FETCH_LOCATION_CONFIG_ERROR:
      return {
        ...state,
        error: action.error,
      };

    case RESET_VIEW:
      return {
        ...initialState,
      };
    default:
      return state;
  }
}