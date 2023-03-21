import {startsWith, getFileExtension} from '../utils/string';
import {getUrlFromUri} from '../utils/uri';
import {FileContentTypes} from './filesLoader';
import {UrlContentTypes} from './urlsLoader';
import {MemoryLoader} from './memoryLoader';

/**
 * The zip library.
 *
 * @external JSZip
 * @see https://github.com/Stuk/jszip
 */
//var JSZip = JSZip || {};
import * as JSZip from 'jszip';

/**
 * ZIP data loader.
 *
 * @class
 */
export class ZipLoader {

  /**
   * Loading flag.
   *
   * @private
   * @type {boolean}
   */
  #isLoading = false;

  /**
   * Set the loader options.
   *
   * @param {object} _opt The input options.
   */
  setOptions(_opt) {
    // does nothing
  }

  /**
   * Is the load ongoing?
   *
   * @returns {boolean} True if loading.
   */
  isLoading() {
    return this.#isLoading;
  }

  #filename = '';
  #files = [];
  #zobjs = null;

  /**
   * JSZip.async callback
   *
   * @param {ArrayBuffer} content unzipped file image
   * @param {object} origin The origin of the file.
   * @param {number} index The data index.
   * @private
   */
  #zipAsyncCallback(content, origin, index) {
    this.#files.push({filename: this.#filename, data: content});

    // sent un-ziped progress with the data index
    // (max 50% to take into account the memory loading)
    var unzipPercent = this.#files.length * 100 / this.#zobjs.length;
    this.onprogress({
      lengthComputable: true,
      loaded: (unzipPercent / 2),
      total: 100,
      index: index,
      item: {
        loaded: unzipPercent,
        total: 100,
        source: origin
      }
    });

    // recursively call until we have all the files
    if (this.#files.length < this.#zobjs.length) {
      var num = this.#files.length;
      this.#filename = this.#zobjs[num].name;
      this.#zobjs[num].async('arrayBuffer').then((content) => {
        this.#zipAsyncCallback(content, origin, index);
      });
    } else {
      var memoryIO = new MemoryLoader();
      // memoryIO.onloadstart: nothing to do
      memoryIO.onprogress = (progress) => {
        // add 50% to take into account the un-zipping
        progress.loaded = 50 + progress.loaded / 2;
        // set data index
        progress.index = index;
        this.onprogress(progress);
      };
      memoryIO.onloaditem = this.onloaditem;
      memoryIO.onload = this.onload;
      memoryIO.onloadend = (event) => {
        // reset loading flag
        this.#isLoading = false;
        // call listeners
        this.onloadend(event);
      };
      memoryIO.onerror = this.onerror;
      memoryIO.onabort = this.onabort;
      // launch
      memoryIO.load(this.#files);
    }
  }

  /**
   * Load data.
   *
   * @param {object} buffer The DICOM buffer.
   * @param {string} origin The data origin.
   * @param {number} index The data index.
   */
  load(buffer, origin, index) {
    // send start event
    this.onloadstart({
      source: origin
    });
    // set loading flag
    this.#isLoading = true;

    JSZip.loadAsync(buffer).then((zip) => {
      this.#files = [];
      this.#zobjs = zip.file(/.*\.dcm/);
      // recursively load zip files into the files array
      var num = this.#files.length;
      this.#filename = this.#zobjs[num].name;
      this.#zobjs[num].async('arrayBuffer').then((content) => {
        this.#zipAsyncCallback(content, origin, index);
      });
    });
  }

  /**
   * Abort load: pass to listeners.
   */
  abort() {
    // reset loading flag
    this.#isLoading = false;
    // call listeners
    this.onabort({});
    this.onloadend({});
  }

  /**
   * Check if the loader can load the provided file.
   *
   * @param {object} file The file to check.
   * @returns {boolean} True if the file can be loaded.
   */
  canLoadFile(file) {
    var ext = getFileExtension(file.name);
    return (ext === 'zip');
  }

  /**
   * Check if the loader can load the provided url.
   *
   * @param {string} url The url to check.
   * @param {object} options Optional url request options.
   * @returns {boolean} True if the url can be loaded.
   */
  canLoadUrl(url, options) {
    // if there are options.requestHeaders, just base check on them
    if (typeof options !== 'undefined' &&
      typeof options.requestHeaders !== 'undefined') {
      // starts with 'application/zip'
      var isZip = function (element) {
        return element.name === 'Accept' &&
          startsWith(element.value, 'application/zip');
      };
      return typeof options.requestHeaders.find(isZip) !== 'undefined';
    }

    var urlObjext = getUrlFromUri(url);
    var ext = getFileExtension(urlObjext.pathname);
    return (ext === 'zip');
  }

  /**
   * Check if the loader can load the provided memory object.
   *
   * @param {object} mem The memory object.
   * @returns {boolean} True if the object can be loaded.
   */
  canLoadMemory(mem) {
    if (typeof mem['Content-Type'] !== 'undefined') {
      if (mem['Content-Type'].includes('zip')) {
        return true;
      }
    }
    if (typeof mem.filename !== 'undefined') {
      return this.canLoadFile({name: mem.filename});
    }
    return false;
  }

  /**
   * Get the file content type needed by the loader.
   *
   * @returns {number} One of the 'fileContentTypes'.
   */
  loadFileAs() {
    return FileContentTypes.ArrayBuffer;
  }

  /**
   * Get the url content type needed by the loader.
   *
   * @returns {number} One of the 'urlContentTypes'.
   */
  loadUrlAs() {
    return UrlContentTypes.ArrayBuffer;
  }

  /**
   * Handle a load start event.
   * Default does nothing.
   *
   * @param {object} _event The load start event.
   */
  onloadstart(_event) {}

  /**
   * Handle a load progress event.
   * Default does nothing.
   *
   * @param {object} _event The progress event.
   */
  onprogress(_event) {}

  /**
   * Handle a load item event.
   * Default does nothing.
   *
   * @param {object} _event The load item event fired
   *   when a file item has been loaded successfully.
   */
  onloaditem(_event) {}

  /**
   * Handle a load event.
   * Default does nothing.
   *
   * @param {object} _event The load event fired
   *   when a file has been loaded successfully.
   */
  onload(_event) {}

  /**
   * Handle an load end event.
   * Default does nothing.
   *
   * @param {object} _event The load end event fired
   *  when a file load has completed, successfully or not.
   */
  onloadend(_event) {}

  /**
   * Handle an error event.
   * Default does nothing.
   *
   * @param {object} _event The error event.
   */
  onerror(_event) {}

  /**
   * Handle an abort event.
   * Default does nothing.
   *
   * @param {object} _event The abort event.
   */
  onabort(_event) {}

} // class DicomDataLoader
