import counterpart from 'counterpart';
import classnames from 'classnames';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { push } from 'react-router-redux';
import { Map, List, Set } from 'immutable';
import currentDevice from 'current-device';

import {
  getViewLayout,
  // browseViewRequest,
  createViewRequest,
  deleteStaticFilter,
  filterViewRequest,
  getViewRowsByIds,
} from '../../api';

import { fetchDocument } from '../../actions/DataFetching';

import {
  closeListIncludedView,
  setListId,
  setListIncludedView,
  setPagination,
  setSorting,
} from '../../actions/ListActions';
import {
  connectWS,
  disconnectWS,
  updateRawModal,
  indicatorState,
  selectTableItems,
  deselectTableItems,
  removeSelectedTableItems,
} from '../../actions/WindowActions';
import { parseToDisplay, getRowsData } from '../../utils/documentListHelper';
import { getSelectionDirect } from '../../reducers/windowHandler';
import {
  DLpropTypes,
  DLcontextTypes,
  DLmapStateToProps,
  NO_SELECTION,
  NO_VIEW,
  PANEL_WIDTHS,
  getSortingQuery,
  redirectToNewDocument,
  doesSelectionExist,
  filtersToMap,
  mergeColumnInfosIntoViewRows,
  mergeRows,
} from '../../utils/documentListHelper';
import Spinner from '../app/SpinnerOverlay';
import BlankPage from '../BlankPage';
import DataLayoutWrapper from '../DataLayoutWrapper';
import Filters from '../filters/Filters';
import FiltersStatic from '../filters/FiltersStatic';
import Table from '../table/Table';
import QuickActions from './QuickActions';
import SelectionAttributes from './SelectionAttributes';

/**
 * @file Class based component.
 * @module DocumentList
 * @extends Component
 */
export class DocumentList extends Component {
  constructor(props) {
    super(props);

    const { defaultViewId, defaultPage, defaultSort } = props;

    this.pageLength =
      currentDevice.type === 'mobile' || currentDevice.type === 'tablet'
        ? 9999
        : 20;
    this.supportAttribute = false;

    this.state = {
      data: null, // view result (result, firstRow, pageLength etc)
      layout: null,
      pageColumnInfosByFieldName: null,
      toggleWidth: 0,
      viewId: defaultViewId,
      page: defaultPage || 1,
      // sort: defaultSort,
      filtersActive: Map(),
      initialValuesNulled: Map(),
      clickOutsideLock: false,
      isShowIncluded: false,
      hasShowIncluded: false,
      triggerSpinner: true,

      // in some scenarios we don't want to reload table data
      // after edit, as it triggers request, collapses rows and looses selection
      rowEdited: false,
    };

    this.fetchLayoutAndData();
  }

  /**
   * @method componentDidMount
   * @summary ToDo: Describe the method.
   */
  componentDidMount = () => {
    this.mounted = true;
  };

  /**
   * @method componentWillUnmount
   * @summary ToDo: Describe the method.
   */
  componentWillUnmount() {
    this.mounted = false;
    disconnectWS.call(this);
  }

  /**
   * @method UNSAFE_componentWillReceiveProps
   * @summary ToDo: Describe the method.
   */
  UNSAFE_componentWillReceiveProps(nextProps) {
    const {
      defaultPage: nextDefaultPage,
      defaultSort: nextDefaultSort,
      defaultViewId: nextDefaultViewId,
      includedView: nextIncludedView,
      isIncluded: nextIsIncluded,
      refId: nextRefId,
      windowType: nextWindowType,
    } = nextProps;

    const {
      defaultPage,
      defaultSort,
      defaultViewId,
      includedView,
      isIncluded,
      refId,
      windowType,
      dispatch,
      reduxData,
    } = this.props;
    const { page, /*sort,*/ viewId, staticFilterCleared } = this.state;
    const included =
      includedView && includedView.windowType && includedView.viewId;
    const nextIncluded =
      nextIncludedView &&
      nextIncludedView.windowType &&
      nextIncludedView.viewId;
    const location = document.location;

    this.loadSupportAttributeFlag(nextProps);

    /*
     * If we browse list of docs, changing type of Document
     * does not re-construct component, so we need to
     * make it manually while the windowType changes.
     * OR
     * We want to refresh the window (generate new viewId)
     * OR
     * The reference ID is changed
     */
    if (
      staticFilterCleared ||
      nextWindowType !== windowType ||
      (nextDefaultViewId === undefined &&
        nextDefaultViewId !== defaultViewId) ||
      (nextWindowType === windowType &&
        ((nextDefaultViewId !== defaultViewId &&
          isIncluded &&
          nextIsIncluded) ||
          location.hash === '#notification')) ||
      nextRefId !== refId
    ) {
      this.setState(
        {
          data: null,
          // rowDataMap: Map({ 1: List() }),
          layout: null,
          filtersActive: Map(),
          initialValuesNulled: Map(),
          viewId: location.hash === '#notification' ? this.state.viewId : null,
          staticFilterCleared: false,
          triggerSpinner: true,
        },
        () => {
          if (included) {
            dispatch(closeListIncludedView(includedView));
          }

          this.fetchLayoutAndData();
        }
      );
    }

    const stateChanges = {};

    //TODO: Handle sorting/pagination from
    if (nextDefaultSort !== defaultSort && nextDefaultSort !== reduxData.sort) {
      stateChanges.sort = nextDefaultSort;
    }

    if (nextDefaultPage !== defaultPage && nextDefaultPage !== page) {
      stateChanges.page = nextDefaultPage || 1;
    }

    if (nextDefaultViewId !== viewId) {
      dispatch(removeSelectedTableItems({ viewId: viewId, windowType }));

      stateChanges.viewId = nextDefaultViewId;
      stateChanges.refreshSelection = true;
    }

    if (included && !nextIncluded) {
      stateChanges.isShowIncluded = false;
      stateChanges.hasShowIncluded = false;
    }

    if (Object.keys(stateChanges).length) {
      this.setState({
        ...stateChanges,
      });
    }
  }

  /**
   * @method shouldComponentUpdate
   * @summary ToDo: Describe the method.
   */
  shouldComponentUpdate(nextProps, nextState) {
    return !!nextState.layout && !!nextState.data;
  }

  /**
   * @method componentDidUpdate
   * @summary ToDo: Describe the method.
   */
  componentDidUpdate(prevProps, prevState) {
    const { setModalDescription } = this.props;
    const { data } = this.state;

    if (prevState.data !== data && setModalDescription) {
      setModalDescription(data.description);
    }
  }

  /**
   * @method connectWebSocket
   * @summary ToDo: Describe the method.
   */
  connectWebSocket = () => {
    const { windowType, dispatch, viewId } = this.props;
    // const { viewId } = this.state;

    connectWS.call(this, `/view/${viewId}`, msg => {
      const { fullyChanged, changedIds } = msg;

      // TODO: Handle WS data
      if (changedIds) {
        getViewRowsByIds(windowType, viewId, changedIds.join()).then(
          response => {
            const {
              data,
              pageColumnInfosByFieldName,
              filtersActive,
            } = this.state;
            const toRows = data.result;

            const { rows, removedRows } = mergeRows({
              toRows,
              fromRows: [...response.data],
              columnInfosByFieldName: pageColumnInfosByFieldName,
              changedIds,
            });
            const rowsList = List(rows);

            if (removedRows.length) {
              dispatch(deselectTableItems(removedRows, windowType, viewId));
            } else {
              if (filtersActive.size) {
                this.filterView();
              }

              // force updating actions
              this.updateQuickActions();
            }

            this.setState({
              data: {
                ...this.state.data,
                result: rowsList,
              },
              // rowDataMap: Map({ 1: rowsList }),
            });
          }
        );
      }

      if (fullyChanged == true) {
        const { dispatch, windowType, selections, viewId } = this.props;
        // const { viewId } = this.state;
        const selection = getSelectionDirect(selections, windowType, viewId);

        // Reload Attributes after QuickAction is done
        selection.length &&
          dispatch(
            selectTableItems({
              windowType,
              viewId,
              ids: [selection[0]],
            })
          );

        this.browseView();
        this.updateQuickActions();
      }
    });
  };

  /**
   * @method updateQuickActions
   * @summary ToDo: Describe the method.
   */
  updateQuickActions = childSelection => {
    if (this.quickActionsComponent) {
      this.quickActionsComponent.updateActions(childSelection);
    }
  };

  /**
   * @method loadSupportAttributeFlag
   * @summary Load supportAttribute of the selected row from the table.
   */
  loadSupportAttributeFlag = ({ selected }) => {
    const { reduxData } = this.props;
    const { data } = this.state;
    if (!data) {
      return;
    }
    const rows = getRowsData(reduxData.data);

    if (selected.length === 1) {
      const selectedRow = rows.find(row => row.id === selected[0]);

      this.supportAttribute = selectedRow && selectedRow.supportAttributes;
      this.setState({
        supportAttribute: selectedRow && selectedRow.supportAttributes,
      });
    } else {
      this.supportAttribute = false;
      this.setState({
        supportAttribute: false,
      });
    }
  };

  /**
   * @method setClickOutsideLock
   * @summary ToDo: Describe the method.
   */
  setClickOutsideLock = value => {
    this.setState({
      clickOutsideLock: !!value,
    });
  };

  /**
   * @method clearStaticFilters
   * @summary ToDo: Describe the method.
   */
  clearStaticFilters = filterId => {
    const { dispatch, windowType } = this.props;
    const { viewId } = this.state;

    deleteStaticFilter(windowType, viewId, filterId).then(response => {
      this.setState({ staticFilterCleared: true }, () =>
        dispatch(push(`/window/${windowType}?viewId=${response.data.viewId}`))
      );
    });
  };

  // FETCHING LAYOUT && DATA -------------------------------------------------
  /**
   * @method fetchLayoutAndData
   * @summary ToDo: Describe the method.
   */
  fetchLayoutAndData = isNewFilter => {
    const {
      windowType,
      type,
      dispatch,
      viewProfileId,
      setModalTitle,
      setNotFound,
    } = this.props;
    const { viewId } = this.state;

    getViewLayout(windowType, type, viewProfileId)
      .then(response => {
        this.mounted &&
          this.setState(
            {
              layout: response.data,
            },
            () => {
              const { allowedCloseActions } = response.data;

              if (allowedCloseActions) {
                dispatch(updateRawModal(windowType, { allowedCloseActions }));
              }

              if (viewId) {
                this.connectWebSocket(viewId);

                if (!isNewFilter) {
                  this.browseView();
                } else {
                  this.filterView();
                }
              } else {
                this.createView();
              }
              setModalTitle && setModalTitle(response.data.caption);
            }
          );
      })
      .catch(() => {
        // We have to always update that fields to refresh that view!
        // Check the shouldComponentUpdate method
        this.setState(
          {
            layout: 'notfound',
            triggerSpinner: false,
          },
          () => {
            setNotFound && setNotFound(true);
          }
        );
      });
  };

  /**
   * @method browseView
   * @summary If viewId exist, than browse that view.
   */
  browseView = () => {
    const { viewId, page, sort } = this.state;

    // in case of redirect from a notification, first call will have viewId empty
    if (viewId) {
      this.getData(viewId, page, sort).catch(err => {
        if (err.response && err.response.status === 404) {
          this.createView();
        }
      });
    }
  };

  /**
   * @method createView
   * @summary ToDo: Describe the method.
   */
  createView = () => {
    const {
      windowType,
      type,
      refType,
      refId,
      refTabId,
      refRowIds,
    } = this.props;
    const { page, sort, filtersActive } = this.state;

    createViewRequest({
      windowId: windowType,
      viewType: type,
      filters: filtersActive.toIndexedSeq().toArray(),
      refDocType: refType,
      refDocId: refId,
      refTabId,
      refRowIds,
    }).then(response => {
      this.mounted &&
        this.setState(
          {
            data: {
              ...response.data,
            },
            viewId: response.data.viewId,
            triggerSpinner: false,
          },
          () => {
            this.connectWebSocket(response.data.viewId);
            this.getData(response.data.viewId, page, sort);
          }
        );
    });
  };

  /**
   * @method filterView
   * @summary ToDo: Describe the method.
   */
  filterView = () => {
    const { windowType, isIncluded, dispatch } = this.props;
    const { page, sort, filtersActive, viewId } = this.state;

    filterViewRequest(
      windowType,
      viewId,
      filtersActive.toIndexedSeq().toArray()
    ).then(response => {
      const viewId = response.data.viewId;

      if (isIncluded) {
        dispatch(setListIncludedView({ windowType, viewId }));
      }

      this.mounted &&
        this.setState(
          {
            data: {
              ...response.data,
            },
            viewId: viewId,
            triggerSpinner: false,
          },
          () => {
            this.getData(viewId, page, sort);
          }
        );
    });
  };

  /**
   * @method getData
   * @summary Loads view/included tab data from REST endpoint
   */
  getData = (id, page, sortingQuery) => {
    const {
      dispatch,
      windowType,
      selections,
      updateUri,
      setNotFound,
      type,
      isIncluded,
    } = this.props;
    const { viewId } = this.state;

    if (setNotFound) {
      setNotFound(false);
    }
    dispatch(indicatorState('pending'));

    if (updateUri) {
      id && updateUri('viewId', id);
      page && updateUri('page', page);
      sortingQuery && updateUri('sort', sortingQuery);
    }

    return dispatch(
      fetchDocument({
        windowId: windowType,
        viewId: id,
        page: page,
        pageLength: this.pageLength,
        orderBy: sortingQuery,
      })
    ).then(response => {
      const result = List(response.result);
      result.hashCode();

      const selection = getSelectionDirect(selections, windowType, viewId);
      const forceSelection =
        (type === 'includedView' || isIncluded) &&
        response &&
        result.size > 0 &&
        (selection.length === 0 ||
          !doesSelectionExist({
            data: {
              ...response,
              result,
            },
            selected: selection,
          }));

      result.map(row => {
        row.fieldsByName = parseToDisplay(row.fieldsByName);
      });

      const pageColumnInfosByFieldName = response.columnsByFieldName;

      mergeColumnInfosIntoViewRows(pageColumnInfosByFieldName, response.result);

      if (this.mounted) {
        const newState = {
          pageColumnInfosByFieldName: pageColumnInfosByFieldName,
          triggerSpinner: false,
        };

        if (response.filters) {
          newState.filtersActive = filtersToMap(response.filters);
        }

        this.setState({ ...newState }, () => {
          if (forceSelection && response && result && result.size > 0) {
            const selection = [result.get(0).id];

            dispatch(
              selectTableItems({
                windowType,
                viewId,
                ids: selection,
              })
            );
          }
        });

        // process modal specific
        const { parentViewId, parentWindowId, headerProperties } = response;
        dispatch(
          updateRawModal(windowType, {
            parentViewId,
            parentWindowId,
            headerProperties,
          })
        );
      }

      dispatch(indicatorState('saved'));
    });
  };

  // END OF FETCHING LAYOUT && DATA ------------------------------------------

  // MANAGING SORT, PAGINATION, FILTERS --------------------------------------

  /**
   * @method handleChangePage
   * @summary ToDo: Describe the method.
   */
  handleChangePage = index => {
    const { reduxData } = this.props;
    // const { data } = this.state;
    let currentPage = reduxData.page;

    switch (index) {
      case 'up':
        currentPage * reduxData.pageLength < reduxData.size ? currentPage++ : null;
        break;
      case 'down':
        currentPage != 1 ? currentPage-- : null;
        break;
      default:
        currentPage = index;
    }

    this.setState(
      {
        page: currentPage,
        triggerSpinner: true,
      },
      () => {
        this.getData(reduxData.viewId, currentPage, reduxData.sort);
      }
    );
  };

  /**
   * @method sortData
   * @summary ToDo: Describe the method.
   */
  sortData = (asc, field, startPage) => {
    const { viewId, page } = this.state;

    this.setState(
      {
        // sort: getSortingQuery(asc, field),
        triggerSpinner: true,
      },
      () => {
        this.getData(viewId, startPage ? 1 : page, getSortingQuery(asc, field));
      }
    );
  };

  /**
   * @method handleFilterChange
   * @summary ToDo: Describe the method.
   */
  handleFilterChange = activeFilters => {
    this.setState(
      {
        filtersActive: activeFilters,
        page: 1,
        triggerSpinner: true,
      },
      () => {
        this.fetchLayoutAndData(true);
      }
    );
  };

  /**
   * @method resetInitialFilters
   * @summary ToDo: Describe the method.
   */
  resetInitialFilters = (filterId, parameterName) => {
    let { initialValuesNulled } = this.state;
    let filterParams = initialValuesNulled.get(filterId);

    if (!filterParams && parameterName) {
      filterParams = Set([parameterName]);
    } else if (filterParams && parameterName) {
      filterParams = filterParams.add(parameterName);
    }

    if (!parameterName) {
      initialValuesNulled = initialValuesNulled.delete(filterId);
    } else {
      initialValuesNulled = initialValuesNulled.set(filterId, filterParams);
    }

    this.setState({
      initialValuesNulled,
    });
  };

  // END OF MANAGING SORT, PAGINATION, FILTERS -------------------------------

  /**
   * @method setTableRowEdited
   * @summary ToDo: Describe the method.
   */
  setTableRowEdited = val => {
    this.setState(
      {
        rowEdited: val,
      },
      () => this.updateQuickActions()
    );
  };

  /**
   * @method adjustWidth
   * @summary ToDo: Describe the method.
   */
  adjustWidth = () => {
    const widthIdx =
      this.state.toggleWidth + 1 === PANEL_WIDTHS.length
        ? 0
        : this.state.toggleWidth + 1;

    this.setState({
      toggleWidth: widthIdx,
    });
  };

  /**
   * @method redirectToDocument
   * @summary ToDo: Describe the method.
   */
  redirectToDocument = id => {
    const {
      dispatch,
      isModal,
      windowType,
      isSideListShow,
      reduxData,
    } = this.props;
    const { sort, page } = this.state;

    if (isModal) {
      return;
    }

    dispatch(push(`/window/${windowType}/${id}`));

    if (!isSideListShow) {
      // Caching last settings
      dispatch(setPagination(page, windowType));
      dispatch(setSorting(sort, windowType));
      dispatch(setListId(reduxData.viewId, windowType));
    }
  };

  /**
   * @method showIncludedView
   * @summary ToDo: Describe the method.
   */
  showIncludedViewOnSelect = ({
    showIncludedView,
    windowType,
    viewId,
    forceClose,
  } = {}) => {
    const { dispatch } = this.props;

    this.setState(
      {
        isShowIncluded: !!showIncludedView,
        hasShowIncluded: !!showIncludedView,
      },
      () => {
        if (showIncludedView) {
          dispatch(setListIncludedView({ windowType, viewId }));
        }
      }
    );

    // can't use setState callback because component might be unmounted and
    // callback is never called
    if (!showIncludedView) {
      dispatch(closeListIncludedView({ windowType, viewId, forceClose }));
    }
  };

  /**
   * @method getSelected
   * @summary ToDo: Describe the method.
   */
  getSelected = () => {
    const {
      selections,
      windowType,
      includedView,
      parentWindowType,
      parentDefaultViewId,
      reduxData: { viewId },
    } = this.props;

    return {
      selected: getSelectionDirect(selections, windowType, viewId),
      childSelected:
        includedView && includedView.windowType
          ? getSelectionDirect(
              selections,
              includedView.windowType,
              includedView.viewId
            )
          : NO_SELECTION,
      parentSelected: parentWindowType
        ? getSelectionDirect(selections, parentWindowType, parentDefaultViewId)
        : NO_SELECTION,
    };
  };

  /**
   * @method render
   * @summary ToDo: Describe the method.
   */
  render() {
    const {
      windowType,
      viewProfileId,
      open,
      closeOverlays,
      parentDefaultViewId,
      inBackground,
      fetchQuickActionsOnInit,
      isModal,
      processStatus,
      readonly,
      includedView,
      isIncluded,
      disablePaginationShortcuts,
      notfound,
      disconnectFromState,
      autofocus,
      inModal,
      updateParentSelectedIds,
      modal,
      dispatch,
      reduxData,
    } = this.props;
    const {
      // page,
      rowDataMap,
      viewId,
      size,
      staticFilters,
      orderBy,
      queryLimitHit,
    } = reduxData;

    const {
      layout,
      // data,
      // viewId,
      clickOutsideLock,
      page,
      filtersActive,
      isShowIncluded,
      hasShowIncluded,
      refreshSelection,
      supportAttribute,
      toggleWidth,
      rowEdited,
      initialValuesNulled,
      // rowDataMap,
    } = this.state;
    let { selected, childSelected, parentSelected } = this.getSelected();
    const modalType = modal ? modal.modalType : null;
    const stopShortcutPropagation =
      (isIncluded && !!selected) || (inModal && modalType === 'process');

    const styleObject = {};
    if (toggleWidth !== 0) {
      styleObject.flex = PANEL_WIDTHS[toggleWidth];
    }

    const hasIncluded =
      layout &&
      layout.includedView &&
      includedView &&
      includedView.windowType &&
      includedView.viewId;

    const selectionValid = doesSelectionExist({
      // data,
      reduxData,
      selected,
      hasIncluded,
    });

    if (!selectionValid) {
      selected = null;
    }

    const blurWhenOpen =
      layout && layout.includedView && layout.includedView.blurWhenOpen;

    if (notfound || layout === 'notfound' || reduxData.notfound === 'notfound') {
      return (
        <BlankPage what={counterpart.translate('view.error.windowName')} />
      );
    }

    console.log('RowDataMap: ', rowDataMap)

    const showQuickActions = true;

    return (
      <div
        className={classnames('document-list-wrapper', {
          'document-list-included': isShowIncluded || isIncluded,
          'document-list-has-included': hasShowIncluded || hasIncluded,
        })}
        style={styleObject}
      >
        {layout && isModal && hasIncluded && hasShowIncluded && (
          <div className="column-size-button col-xxs-3 col-md-0 ignore-react-onclickoutside">
            <button
              className={classnames(
                'btn btn-meta-outline-secondary btn-sm ignore-react-onclickoutside',
                {
                  normal: toggleWidth === 0,
                  narrow: toggleWidth === 1,
                  wide: toggleWidth === 2,
                }
              )}
              onClick={this.adjustWidth}
            />
          </div>
        )}

        {layout && !readonly && (
          <div className="panel panel-primary panel-spaced panel-inline document-list-header">
            <div className={hasIncluded ? 'disabled' : ''}>
              {layout.supportNewRecord && !isModal && (
                <button
                  className="btn btn-meta-outline-secondary btn-distance btn-sm hidden-sm-down btn-new-document"
                  onClick={() => redirectToNewDocument(dispatch, windowType)}
                  title={layout.newRecordCaption}
                >
                  <i className="meta-icon-add" />
                  {layout.newRecordCaption}
                </button>
              )}

              {layout.filters && (
                <Filters
                  {...{
                    windowType,
                    viewId,
                    filtersActive,
                    initialValuesNulled,
                  }}
                  filterData={filtersToMap(layout.filters)}
                  updateDocList={this.handleFilterChange}
                  resetInitialValues={this.resetInitialFilters}
                />
              )}

              {reduxData.data && staticFilters && (
                <FiltersStatic
                  {...{ windowType, viewId }}
                  data={staticFilters}
                  clearFilters={this.clearStaticFilters}
                />
              )}
            </div>

            {reduxData.data && showQuickActions && (
              <QuickActions
                processStatus={processStatus}
                ref={c => {
                  this.quickActionsComponent = c && c.getWrappedInstance();
                }}
                selected={selected}
                viewId={viewId}
                windowType={windowType}
                viewProfileId={viewProfileId}
                fetchOnInit={fetchQuickActionsOnInit}
                disabled={hasIncluded && blurWhenOpen}
                shouldNotUpdate={inBackground && !hasIncluded}
                inBackground={disablePaginationShortcuts}
                inModal={inModal}
                stopShortcutPropagation={stopShortcutPropagation}
                childView={
                  hasIncluded
                    ? {
                        viewId: includedView.viewId,
                        viewSelectedIds: childSelected,
                      }
                    : NO_VIEW
                }
                parentView={
                  isIncluded
                    ? {
                        viewId: parentDefaultViewId,
                        viewSelectedIds: parentSelected,
                      }
                    : NO_VIEW
                }
              />
            )}
          </div>
        )}

        <Spinner
          parent={this}
          delay={300}
          iconSize={50}
          displayCondition={!!(layout && this.state.triggerSpinner)}
          hideCondition={!!(reduxData.data && !this.state.triggerSpinner)}
        />

        {layout && reduxData.data && (
          <div className="document-list-body">
            <Table
              entity="documentView"
              ref={c =>
                (this.table =
                  c &&
                  c.getWrappedInstance() &&
                  c.getWrappedInstance().instanceRef)
              }
              rowData={rowDataMap}
              cols={layout.elements}
              collapsible={layout.collapsible}
              expandedDepth={layout.expandedDepth}
              tabId={1}
              windowId={windowType}
              emptyText={layout.emptyResultText}
              emptyHint={layout.emptyResultHint}
              readonly={true}
              supportOpenRecord={layout.supportOpenRecord}
              rowEdited={rowEdited}
              onRowEdited={this.setTableRowEdited}
              keyProperty="id"
              onDoubleClick={this.redirectToDocument}
              size={size}
              pageLength={this.pageLength}
              handleChangePage={this.handleChangePage}
              onSelectionChanged={updateParentSelectedIds}
              mainTable={true}
              updateDocList={this.fetchLayoutAndData}
              sort={this.sortData}
              orderBy={orderBy}
              tabIndex={0}
              indentSupported={layout.supportTree}
              disableOnClickOutside={clickOutsideLock}
              limitOnClickOutside={isModal}
              defaultSelected={selected}
              refreshSelection={refreshSelection}
              queryLimitHit={queryLimitHit}
              showIncludedViewOnSelect={this.showIncludedViewOnSelect}
              openIncludedViewOnSelect={
                layout.includedView && layout.includedView.openOnSelect
              }
              blurOnIncludedView={blurWhenOpen}
              {...{
                isIncluded,
                disconnectFromState,
                autofocus,
                open,
                page,
                closeOverlays,
                inBackground,
                disablePaginationShortcuts,
                isModal,
                hasIncluded,
                viewId,
                windowType,
              }}
            >
              {layout.supportAttributes && !isIncluded && !hasIncluded && (
                <DataLayoutWrapper
                  className="table-flex-wrapper attributes-selector js-not-unselect"
                  entity="documentView"
                  {...{ windowType, viewId }}
                  onRowEdited={this.setTableRowEdited}
                >
                  <SelectionAttributes
                    supportAttribute={supportAttribute}
                    setClickOutsideLock={this.setClickOutsideLock}
                    selected={selectionValid ? selected : undefined}
                    shouldNotUpdate={inBackground}
                  />
                </DataLayoutWrapper>
              )}
            </Table>
          </div>
        )}
      </div>
    );
  }
}

/**
 * @typedef {object} Props Component props
 * @prop {object} DLpropTypes
 */
DocumentList.propTypes = { ...DLpropTypes };

/**
 * @typedef {object} Props Component context
 * @prop {object} DLcontextTypes
 */
DocumentList.contextTypes = { ...DLcontextTypes };

export default connect(
  DLmapStateToProps,
  null,
  null,
  { withRef: true }
)(DocumentList);
