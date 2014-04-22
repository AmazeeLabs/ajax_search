(function($) {

  // Initialize settings.
  var settings = Drupal.settings.ajaxSearch;
  if (settings.historyApiOnly && !window.history.pushState) {
    return;
  }

  // Initialize code.
  var ajaxSearch = initAjaxSearch();

  // Go through configurations, and choose one.
  $.each(settings.configurations, function(_, cfg) {
    ajaxSearch.$replaceWrapper = $(cfg.replaceWrapperContextSelector + ' ' + cfg.replaceWrapperSelector);
    if (ajaxSearch.$replaceWrapper.size()) {
      ajaxSearch.cfg = cfg;
      return false;
    }
  });
  if (!ajaxSearch.$replaceWrapper.size()) {
    return;
  }

  ajaxSearch.handleHistoryButtons();

  // Save initial page content before Drupal behaviors applied.
  ajaxSearch.saveHistory(window.location.href, ajaxSearch.$replaceWrapper.html(), Drupal.settings);

  /**
   * Ajaxify search pages.
   */
  Drupal.behaviors.ajaxSearchAjaxify = {
    attach : function(context, _) {

      var $ajaxRegions = ajaxSearch.cfg.ajaxRegionsSelector
        ? $(ajaxSearch.cfg.ajaxRegionsSelector, ajaxSearch.$replaceWrapper)
        : ajaxSearch.$replaceWrapper;

      // Go through all given regions and ajaxify them.
      $ajaxRegions.once('ajax-search-ajaxify').each(function() {
        var $region = $(this);

        // Prevent forms submit. Do it via ajax.
        $region.find('form').each(function() {
          $(this).once('ajax-search-submit', function() {
            var $form = $(this);
            var url = decodeURIComponent($form.attr('action'));
            if (ajaxSearch.checkUrl(url)) {
              // Apply our submit handler to form.
              $form.submit(function() {
                ajaxSearch.elementShowProgress($form.find('input[type=submit]').first());
                var data = $form.serialize();
                ajaxSearch.doAjax(url, $form.attr('method'), data);
                return false;
              });
              // Remove core ajax handlers from submit buttons. This can be
              // views-ajax handlers, etc.
              $form.find('input[type="submit"]').each(function() {
                $(this).once('ajax-search-prevent-other-ajax', function() {
                  var $submit = $(this);
                  if ($submit.data("events")) {
                    $.each($submit.data("events"), function(eventType, handlers) {
                      $.each(handlers, function(key, handler) {
                        if (handler.handler.toString().match(/return ajax\./gi)) {
                          $submit.unbind(eventType, handler.handler);
                        }
                      });
                    });
                  }
                });
              });
            }
          });
        });

        // Prevent links clicks. Do it via ajax.
        $region.find('a').once('ajax-search-click').click(function() {
          var $link = $(this);
          var url = decodeURIComponent($link.attr('href'));
          if (ajaxSearch.checkUrl(url)) {
            ajaxSearch.elementShowProgress($link);
            var $pager = $link.closest('.pager');
            var scrollToSelector = $pager.size()
              ? '.' + $pager.prev().attr('class').split(/\s+/).join('.')
              : undefined;
            ajaxSearch.doAjax(url, undefined, undefined, scrollToSelector);
            return false;
          }
        });

        // Fix facetapi_select module behavior. Unbind original handler, and
        // bind own.
        if (Drupal.behaviors.facetapiSelect && Drupal.behaviors.facetapiSelect.goToLocation) {
          $('form', $region).unbind('change', Drupal.behaviors.facetapiSelect.goToLocation);
        }
        if (Drupal.settings.facetapi && Drupal.settings.facetapi.facets) {
          for (var index in Drupal.settings.facetapi.facets) {
            var facet = Drupal.settings.facetapi.facets[index];
            if (facet.widget === 'facetapi_select_dropdowns' && facet.autoSubmit === 1) {
              $('#' + facet.id + ' .form-select', $region).change(function() {
                var $this = $(this);
                var url = decodeURIComponent($this.val());
                if (ajaxSearch.checkUrl(url)) {
                  ajaxSearch.elementShowProgress($this);
                  ajaxSearch.doAjax(url);
                  return false;
                }
              });
            }
          }
        }
      });
    }
  };

  // Fix facetapi's hard redirect.
  if (Drupal.facetapi && Drupal.facetapi.Redirect && Drupal.facetapi.Redirect.prototype.gotoHref) {
    var facetapiGotoHrefOrig = Drupal.facetapi.Redirect.prototype.gotoHref;
    Drupal.facetapi.Redirect.prototype.gotoHref = function() {
      if (ajaxSearch.checkUrl(this.href)) {
        ajaxSearch.elementShowProgress($('.checker.focus').eq(0));
        ajaxSearch.doAjax(this.href);
        return false;
      }
      else {
        facetapiGotoHrefOrig();
      }
    }
  }

  /**
   * Initializes Drupal.ajaxSearch object and returns it.
   */
  function initAjaxSearch() {
    Drupal.ajaxSearch = {

      /**
       * Wrapper of the main content that should be replace during ajax calls.
       * 
       * Should be initialized outside.
       */
      $replaceWrapper: $(),

      /**
       * The first found appropriate configuration.
       *
       * See hook_ajax_search_configurations() function in ajax_search.api.php.
       *
       * Should be initialized outside.
       */
      cfg: {
        replaceWrapperContextSelector: '',
        replaceWrapperSelector: '',
        ajaxRegionsSelector: ''
      },

      /**
       * Div with temporary data.
       */
      $tempDiv: $('<div>').css('display', 'none').appendTo('body'),

      /**
       * Progress (throbber) element.
       */
      $progress: $('<div class="ajax-progress ajax-progress-throbber"><div class="throbber">&nbsp;</div></div>'),

      /**
       * An alias for window.history.pushState().
       */
      pushState: function(data,title,url) {
        if (window.history.pushState) {
          window.history.pushState(data,title,url);
        }
      },

      /**
       * Attaches handlers to history buttons.
       */
      handleHistoryButtons: function() {
        var self = this;
        window.addEventListener('popstate', function() {
          // First call is page load. Do not process it.
          if (self.popstateFirstCall) {
            self.popstateFirstCall = false;
            return;
          }
          self.breakAjaxRequest();
          self.restoreHistory(window.location.href);
          self.trackPageWithGA();
        });
      },
      popstateFirstCall: true,

      /**
       * Tracks page view with Google Analytics.
       */
      trackPageWithGA: function() {
        if (window.history.pushState && typeof(_gaq) != 'undefined' && _gaq.push) {
          _gaq.push(['_trackPageview']);
        }
      },

      /**
       * Breaks AJAX request, if there is one.
       */
      breakAjaxRequest: function() {
        if (typeof(this.request) == 'object') {
          this.request.abort();
          this.request = false;
        }
      },
      request: false,

      /**
       * Saves page content.
       */
      saveHistory: function(url, content, settings) {
        history[url] = {content: content, url: url, settings: settings};
      },
      /**
       * Restores page content.
       */
      restoreHistory: function(url) {
        if (typeof(history[url]) != 'undefined') {
          this.updatePageContent(history[url]);
        }
      },
      history: {},

      /**
       * Updates page content with saved (or retrieved via ajax) values.
       * 
       * Object "data" should contain "url", "content", "setting" properties.
       * The "content" parameter should be a raw html before
       * Drupal.attachBehaviors applied.
       */
      updatePageContent: function(data) {
        this.$replaceWrapper.html(data.content).removeClass('ajax-search-ajaxify-processed');
        if (data.messages) {
          // todo (alex): add messages support.
        }
        Drupal.attachBehaviors(this.$replaceWrapper, data.settings);
      },

      /**
       * Checks if URL could be ajaxified.
       */
      checkUrl: function (url) {
        var self = this;
        if (!this.urlVariantsProcessed) {
          $.each(self.urlVariants, function(key, value) {
            if(value.substr(-1) == '/') {
              value = value.substr(0, value.length - 1);
            }
            self.urlVariants[key] = value.toLowerCase();
          });
          this.urlVariantsProcessed = true;
        }
        var ret = false;
        url = url.toLowerCase();
        $.each(this.urlVariants, function(_, variant) {
          if (url == variant
              || url.indexOf(variant + '/') == 0
              || url.indexOf(variant + '?') == 0
              || url.indexOf(variant + '#') == 0) {
            ret = true;
            return false;
          }
        });
        return ret;
      },
      urlVariants: [
        'http://' + document.domain + Drupal.settings.basePath + settings.basePath,
        'http://' + document.domain + Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePath,
        'http://' + document.domain + Drupal.settings.basePath + settings.basePathAlias,
        'http://' + document.domain + Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePathAlias,
        'https://' + document.domain + Drupal.settings.basePath + settings.basePath,
        'https://' + document.domain + Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePath,
        'https://' + document.domain + Drupal.settings.basePath + settings.basePathAlias,
        'https://' + document.domain + Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePathAlias,
        Drupal.settings.basePath + settings.basePath,
        Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePath,
        Drupal.settings.basePath + settings.basePathAlias,
        Drupal.settings.basePath + Drupal.settings.pathPrefix + settings.basePathAlias
      ],
      urlVariantsProcessed: false,

      /**
       * Adds "ajax-search" prefix to the URL.
       */
      prepareUrl: function(url) {
        $.each(this.urlPrefixVariants, function(_, variant) {
          if (url.indexOf(variant) == 0) {
            url = url.substring(variant.length);
            return false;
          }
        });
        return Drupal.settings.basePath + Drupal.settings.pathPrefix + 'ajax-search/' + url;
      },
      urlPrefixVariants: [
        ('http://' + document.domain + Drupal.settings.basePath).toLowerCase(),
        ('https://' + document.domain + Drupal.settings.basePath).toLowerCase(),
        (Drupal.settings.basePath).toLowerCase()
      ],

      /**
       * Performs AJAX request. Request type and data are optional.
       */
      doAjax: function(url, type, data, scrollToSelector) {
        var self = this;
        this.breakAjaxRequest();
        url = this.prepareUrl(url);
        type = type || 'get';
        data = data || '';
        this.request = $.ajax({
          url: url,
          type: type,
          data: data,
          success: function(response) {

            // We may have more content than necessary, select only required.
            self.$tempDiv.html(response.content);
            // Support single css id selectors like "#css-id".
            var selector = self.cfg.replaceWrapperSelector.indexOf('#') == 0
              ? '[id="' + self.cfg.replaceWrapperSelector.substr(1) + '"]'
              : self.cfg.replaceWrapperSelector;
            response.content = self.$tempDiv.find(selector).html();
            self.$tempDiv.html('');

            var newSettings = $.extend(true, Drupal.settings, response.settings);
            if (Drupal.settings.openlayers && response.settings.openlayers) {
              // For openlayers we should override settings, not merge them.
              newSettings.openlayers = response.settings.openlayers;
            }
            Drupal.settings = response.settings = newSettings;

            self.pushState(null, '', response.url);
            self.updatePageContent(response);

            if (scrollToSelector) {
              var offset = $(scrollToSelector).eq(0).offset();
              if (offset && offset.top) {
                $('html, body').animate({scrollTop: offset.top}, 'fast');
              }
            }

            // Update page URL and save page content into history.
            self.trackPageWithGA();
            self.saveHistory(window.location.href, response.content, response.settings);
          }
          // todo (alex): handle errors.
        });
      },

      /**
       * Adds throbber after the given element.
       */
      elementShowProgress: function($element) {
        var $formItem = $element.closest('.form-item');
        ($formItem.size() ? $formItem : $element).after(this.$progress);
      }
    };
    return Drupal.ajaxSearch;
  }

})(jQuery);
