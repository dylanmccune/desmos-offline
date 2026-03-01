/**
 * CalculatorManager handles the instantiation and teardown of the Desmos API.
 * The core logic relies on the global Desmos object loaded via script tag.
 */

export class CalculatorManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.calcInstance = null;
    this.currentType = null; // '2d', 'geometry', or '3d'
    this._onChangeCallback = null;
  }

  /**
   * Register a callback that fires whenever the calculator state changes.
   */
  onChange(callback) {
    this._onChangeCallback = callback;
    if (this.calcInstance && callback) {
      this._attachObservers(this.calcInstance, callback);
    }
  }

  _attachObservers(instance, callback) {
    console.log('Attaching observers to Desmos instance');
    // 'change' fires for many state-related things
    instance.observeEvent('change', () => {
      console.log('Desmos "change" event fired');
      callback();
    });

    // Explicitly observe these for more reliability across versions/types
    const props = ['expressions', 'graphSettings', 'viewport'];
    props.forEach(prop => {
      instance.observe(prop, () => {
        console.log(`Desmos "${prop}" changed`);
        callback();
      });
    });
  }

  /**
   * Initializes or re-initializes a calculator of a specific type.
   * @param {'2d'|'geometry'|'3d'} type 
   * @param {Object} state (optional) Previous state to restore
   */
  loadCalculator(type, state = null) {
    // If a calculator is already loaded, destroy it fully to prevent memory leaks/UI issues
    if (this.calcInstance) {
      if (typeof this.calcInstance.destroy === 'function') {
        this.calcInstance.destroy();
      }
      this.container.innerHTML = '';
      this.calcInstance = null;
    }

    this.currentType = type;

    // Check if global Desmos object exists
    if (!window.Desmos) {
      console.error('Desmos API not available. The script might not have loaded.');
      return;
    }

    const defaultOptions = {
      keypad: true,
      expressions: true,
      settingsMenu: true,
      expressionsTopbar: true,
      autosize: true
    };

    switch (type) {
      case '2d':
        this.calcInstance = window.Desmos.GraphingCalculator(this.container, defaultOptions);
        break;
      case 'geometry':
        this.calcInstance = window.Desmos.Geometry(this.container, defaultOptions);
        break;
      default:
        console.error(`Unknown calculator type: ${type}`);
        return;
    }

    // Re-attach the change observer to the new instance
    if (this._onChangeCallback && this.calcInstance) {
      this._attachObservers(this.calcInstance, this._onChangeCallback);
    }

    if (state && this.calcInstance) {
      this.setState(state);
    }
  }

  /**
   * Returns current internal state of the graph
   */
  getState() {
    if (this.calcInstance) {
      return this.calcInstance.getState();
    }
    return null;
  }

  /**
   * Sets the state of the graph
   * @param {Object} state 
   */
  setState(state) {
    if (this.calcInstance) {
      this.calcInstance.setState(state);
    }
  }

  /**
   * Captures a screenshot of the current calculator state.
   * @param {Object} options screenshot options (width, height, etc)
   * @returns {Promise<string>} Data URL of the screenshot
   */
  async screenshot(options = { width: 300, height: 225, targetPixelRatio: 1 }) {
    return new Promise((resolve) => {
      if (!this.calcInstance) {
        console.error('Screenshot failed: No calculator instance found.');
        return resolve(null);
      }

      // Check for either asyncScreenshot or screenshot
      const captureMethod = this.calcInstance.asyncScreenshot || this.calcInstance.screenshot;

      if (typeof captureMethod !== 'function') {
        console.error('Screenshot failed: No capture method found on this Desmos instance.');
        return resolve(null);
      }

      const methodName = this.calcInstance.asyncScreenshot ? 'asyncScreenshot' : 'screenshot';
      console.log(`Attempting ${methodName} capture for ${this.currentType}...`);

      // 5 second safety timeout for async capture
      const timeout = setTimeout(() => {
        console.warn(`${methodName} capture timed out after 5s`);
        resolve(null);
      }, 5000);

      try {
        captureMethod.call(this.calcInstance, options, (data) => {
          clearTimeout(timeout);
          if (data) {
            console.log(`${methodName} captured successfully. Data URL length:`, data.length);
          } else {
            console.warn(`${methodName} returned empty data.`);
          }
          resolve(data);
        });
      } catch (err) {
        console.error(`${methodName} unexpected error:`, err);
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }
}
