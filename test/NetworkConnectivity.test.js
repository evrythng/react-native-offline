/* @flow */
import React from 'react';
import { View, Platform, AppState } from 'react-native';
import { shallow } from 'enzyme';
import { render } from 'react-native-testing-library';
import NetworkConnectivity from '../src/components/NetworkConnectivity';
import { setup, clear } from '../src/utils/checkConnectivityInterval';
import checkInternetAccess from '../src/utils/checkInternetAccess';

type MethodsMap = {
  [string]: Function,
};

const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockFetch = jest.fn(() => false);
const mockConnectionChangeHandler = jest.fn();
const mockGetConnectionChangeHandler = jest.fn(
  () => mockConnectionChangeHandler,
);
const mockIntervalHandler = jest.fn();
const mockHandleNetInfoChange = jest.fn();
const mockHandleConnectivityChange = jest.fn();
const mockCheckInternet = jest.fn();

jest.mock('NetInfo', () => ({
  isConnected: {
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
    fetch: mockFetch,
  },
}));

jest.mock('../src/utils/checkConnectivityInterval');
jest.mock('../src/utils/checkInternetAccess', () =>
  jest.fn().mockResolvedValue(true),
);

/**
 * Helper function that creates a class that extends NetworkConnectivity
 * and mocks the specific methods on the prototype,
 * in order to not affect the rest of the tests
 * @param methodsMap
 * @returns {ClassWithMocks}
 */
function mockPrototypeMethods(methodsMap: MethodsMap = {}) {
  class ClassWithMocks extends NetworkConnectivity {}
  Object.entries(methodsMap).forEach(([method, mockFn]: *) => {
    ClassWithMocks.prototype[method] = mockFn;
  });
  return ClassWithMocks;
}

const getElement = ({
  props = {},
  children = () => <View />,
  Component = NetworkConnectivity,
} = {}) => <Component {...props}>{children}</Component>;

describe('NetworkConnectivity', () => {
  afterEach(() => {
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    mockFetch.mockClear();
    mockConnectionChangeHandler.mockClear();
    mockGetConnectionChangeHandler.mockClear();
    mockIntervalHandler.mockClear();
    mockHandleNetInfoChange.mockClear();
    mockHandleConnectivityChange.mockClear();
    mockCheckInternet.mockClear();
  });
  it('passes the connection state into the FACC', () => {
    const children = jest.fn();
    shallow(getElement({ children }));
    expect(children).toHaveBeenCalledWith({ isConnected: true });
  });

  describe('componentDidMount', () => {
    describe('iOS, pingInterval = 0', () => {
      it(`sets up a NetInfo.isConnected listener for connectionChange 
      AND does NOT call setupConnectivityCheckInterval`, () => {
        Platform.OS = 'ios';
        const MockedNetworkConnectivity = mockPrototypeMethods({
          getConnectionChangeHandler: mockGetConnectionChangeHandler,
        });
        shallow(
          getElement({
            Component: MockedNetworkConnectivity,
          }),
        );
        expect(mockAddEventListener).toHaveBeenCalledTimes(1);
        expect(mockAddEventListener).toHaveBeenCalledWith(
          'connectionChange',
          mockConnectionChangeHandler,
        );
        expect(setup).not.toHaveBeenCalled();
      });
    });

    describe('Android, pingInterval = 0', () => {
      it(`sets up a NetInfo.isConnected listener for connectionChange
      AND fetches initial connection
      AND calls the handler
      AND does NOT call setupConnectivityCheckInterval`, done => {
        Platform.OS = 'android';
        const MockedNetworkConnectivity = mockPrototypeMethods({
          getConnectionChangeHandler: mockGetConnectionChangeHandler,
        });
        shallow(
          getElement({
            Component: MockedNetworkConnectivity,
          }),
        );
        expect(mockAddEventListener).toHaveBeenCalledTimes(1);
        expect(mockAddEventListener).toHaveBeenCalledWith(
          'connectionChange',
          mockConnectionChangeHandler,
        );
        expect(mockFetch).toHaveBeenCalledTimes(1);
        process.nextTick(() => {
          expect(mockConnectionChangeHandler).toHaveBeenCalledWith(false);
          expect(setup).not.toHaveBeenCalled();
          done();
        });
      });
    });

    it(`calls setupConnectivityCheckInterval with the right arguments
     WHEN pingInterval is higher than 0`, () => {
      Platform.OS = 'ios';
      const MockedNetworkConnectivity = mockPrototypeMethods({
        intervalHandler: mockIntervalHandler,
      });
      shallow(
        getElement({
          Component: MockedNetworkConnectivity,
          props: {
            pingInterval: 1000,
          },
        }),
      );
      expect(setup).toHaveBeenCalled();
    });
  });

  describe('componentWillUnmount', () => {
    it(`removes the NetInfo listener with the right parameters
      AND call connectivityInterval.clear`, () => {
      const MockedNetworkConnectivity = mockPrototypeMethods({
        getConnectionChangeHandler: mockGetConnectionChangeHandler,
      });
      const wrapper = shallow(
        getElement({
          Component: MockedNetworkConnectivity,
        }),
      );
      wrapper.unmount();
      expect(mockRemoveEventListener).toHaveBeenCalledTimes(1);
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        'connectionChange',
        mockConnectionChangeHandler,
      );
      expect(clear).toHaveBeenCalled();
    });
  });

  describe('getConnectionChangeHandler', () => {
    it('returns this.handleNetInfoChange when props.shouldPing = true', () => {
      const wrapper = shallow(
        getElement({
          props: {
            shouldPing: true,
          },
        }),
      );
      wrapper.instance().handleNetInfoChange = mockHandleNetInfoChange;
      expect(wrapper.instance().getConnectionChangeHandler()).toBe(
        mockHandleNetInfoChange,
      );
    });

    it('returns this.handleConnectivityChange when props.shouldPing = false', () => {
      const wrapper = shallow(
        getElement({
          props: {
            shouldPing: false,
          },
        }),
      );
      wrapper.instance().handleConnectivityChange = mockHandleConnectivityChange;
      expect(wrapper.instance().getConnectionChangeHandler()).toBe(
        mockHandleConnectivityChange,
      );
    });
  });

  describe('handleNetInfoChange', () => {
    it('calls handleConnectivityChange if isConnected is false', () => {
      const wrapper = shallow(getElement());
      wrapper.instance().handleConnectivityChange = mockHandleConnectivityChange;
      wrapper.instance().checkInternet = mockCheckInternet;
      wrapper.instance().handleNetInfoChange(false);
      expect(mockHandleConnectivityChange).toHaveBeenCalledWith(false);
      expect(mockCheckInternet).not.toHaveBeenCalled();
    });

    it('calls checkInternet if isConnected is true', () => {
      const wrapper = shallow(getElement());
      wrapper.instance().handleConnectivityChange = mockHandleConnectivityChange;
      wrapper.instance().checkInternet = mockCheckInternet;
      wrapper.instance().handleNetInfoChange(true);
      expect(mockHandleConnectivityChange).not.toHaveBeenCalled();
      expect(mockCheckInternet).toHaveBeenCalled();
    });
  });

  describe('checkInternet', () => {
    it('returns early if pingIfBackground = false AND app is not in the foreground', async () => {
      AppState.currentState = 'background';
      const wrapper = shallow(
        getElement({
          props: {
            pingInBackground: false,
          },
        }),
      );
      wrapper.instance().handleConnectivityChange = mockHandleConnectivityChange;
      await wrapper.instance().checkInternet();
      expect(checkInternetAccess).not.toHaveBeenCalled();
      expect(mockHandleConnectivityChange).not.toHaveBeenCalled();
    });

    it(`calls checkInternetAccess AND handleConnectivityChange 
    with the right arguments if app is in foreground`, async () => {
      const props = {
        pingTimeout: 2000,
        pingServerUrl: 'dummy.com',
        httpMethod: 'OPTIONS',
      };
      AppState.currentState = 'active';
      const wrapper = shallow(
        getElement({
          props,
        }),
      );
      wrapper.instance().handleConnectivityChange = mockHandleConnectivityChange;
      await wrapper.instance().checkInternet();
      expect(checkInternetAccess).toHaveBeenCalledWith(
        props.pingTimeout,
        props.pingServerUrl,
        props.httpMethod,
      );
      expect(mockHandleConnectivityChange).toHaveBeenCalledWith(true);
    });
  });

  describe('intervalHandler', () => {
    it('returns early if there is connection AND pingOnlyIfOffline = true', () => {
      const wrapper = shallow(
        getElement({
          props: {
            pingOnlyIfOffline: true,
          },
        }),
      );
      wrapper.instance().checkInternet = mockCheckInternet;
      wrapper.setState({ isConnected: true });
      wrapper.instance().intervalHandler();
      expect(mockCheckInternet).not.toHaveBeenCalled();
    });

    it(`calls checkInternet if it's not connected OR pingOnlyIfOffline = false`, () => {
      const wrapper = shallow(
        getElement({
          props: {
            pingOnlyIfOffline: false,
          },
        }),
      );
      wrapper.instance().checkInternet = mockCheckInternet;
      wrapper.setState({ isConnected: false });
      wrapper.instance().intervalHandler();
      expect(mockCheckInternet).toHaveBeenCalledTimes(1);

      wrapper.setState({ isConnected: true });
      wrapper.instance().intervalHandler();
      expect(mockCheckInternet).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleConnectivityChange', () => {
    it('calls setState with the new connection value', () => {
      const mockSetState = jest.fn();
      const MockedNetworkConnectivity = mockPrototypeMethods({
        setState: mockSetState,
      });
      const wrapper = shallow(
        getElement({
          Component: MockedNetworkConnectivity,
        }),
      );

      wrapper.instance().handleConnectivityChange(true);
      expect(mockSetState).toHaveBeenCalledWith({ isConnected: true });

      wrapper.instance().handleConnectivityChange(false);
      expect(mockSetState).toHaveBeenCalledWith({ isConnected: false });
    });
  });

  describe('props validation', () => {
    it('throws if prop pingTimeout is not a number', () => {
      expect(() => render(getElement({ props: { pingTimeout: '4000' } }))).toThrow(
        'you should pass a number as pingTimeout parameter',
      );
    });

    it('throws if prop pingServerUrl is not a string', () => {
      expect(() =>
        render(getElement({ props: { pingServerUrl: 90 } })),
      ).toThrow('you should pass a string as pingServerUrl parameter');
    });

    it('throws if prop shouldPing is not a boolean', () => {
      expect(() =>
        render(getElement({ props: { shouldPing: () => null } })),
      ).toThrow('you should pass a boolean as shouldPing parameter');
    });

    it('throws if prop pingInterval is not a number', () => {
      expect(() =>
        render(getElement({ props: { pingInterval: false } })),
      ).toThrow('you should pass a number as pingInterval parameter');
    });

    it('throws if prop pingOnlyIfOffline is not a boolean', () => {
      expect(() =>
        render(getElement({ props: { pingOnlyIfOffline: 10 } })),
      ).toThrow('you should pass a boolean as pingOnlyIfOffline parameter');
    });

    it('throws if prop pingInBackground is not a boolean', () => {
      expect(() =>
        render(
          getElement({
            props: { pingInBackground: '4000' },
          }),
        ),
      ).toThrow('you should pass a string as pingServerUrl parameter');
    });

    it('throws if prop httpMethod is not either HEAD or OPTIONS', () => {
      expect(() =>
        render(getElement({ props: { httpMethod: 'POST' } })),
      ).toThrow('httpMethod parameter should be either HEAD or OPTIONS');
    });

    it('throws if prop onConnectivityChange is not a function', () => {
      expect(() =>
        render(getElement({ props: { onConnectivityChange: 'foo' } })),
      ).toThrow('you should pass a function as onConnectivityChange parameter');
    });
  });
});
