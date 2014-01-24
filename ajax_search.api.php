<?php

/**
 * Defines page regions that should be ajaxified.
 *
 * NOTE: on each page only the first found configuration is used.
 * First found means the first for which
 * $(replaceWrapperContextSelector + ' ' + replaceWrapperSelector).size()
 * is true.
 * Be as much precise as possible with selector definitions.
 *
 * @return array
 *   See the code for the array specification.
 */
function hook_ajax_search_configurations() {
  return array(

    // Configuration 1.
    array(

      // JQuery selector that defines a wrapper which contents will be replaced
      // on ajax calls.
      // This selector is also used when ajax response is received: to select
      // a particular data within the whole response.
      // Classes selectors are preferable. If you need to define a CSS ID
      // selector: use ID only, like below.
      'replaceWrapperSelector' => '#search-results',

      // JQuery selector defining the region for searching the replaceWrapper.
      // Used only once, on the first page load.
      'replaceWrapperContextSelector' => 'body',
    ),

    // Configuration 2.
    array(
      // Optional selector which defines special regions withing replaceWrapper
      // which should be processed with ajaxSearch click/submit handlers.
      // If omitted: the whole replaceWrapper id used.
      'ajaxRegionsSelector' => '.reg1, .reg2',

      'replaceWrapperSelector' => '.panel-display',
      'replaceWrapperContextSelector' => '.page-node-2502 .pane-page-content',
    ),
  );
}
