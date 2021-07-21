$(function() {
  
  $('#login').click(function() {
    // Call the authorize endpoint, which will return an authorize URL, then redirect to that URL
    $.get('/spotifyLogin', function(data) {
      console.log("SPOTIFY LOGIN")
      console.log(data)
      window.location = data;
    });
  });
  
  const hash = window.location.hash
    .substring(1)
    .split('&')
    .reduce(function (initial, item) {
      if (item) {
        var parts = item.split('=');
        initial[parts[0]] = decodeURIComponent(parts[1]);
      }
      return initial;
    }, {});  
  
  if (hash.access_token) {
    $("#intro").hide();
    $("#loader").show()
    $.get({url: '/endpoint', headers: {"Authorization": `Bearer ${hash.access_token}`}}, function(data){
      console.log(data);
      $("#loader").hide()
      $("#outro").show();
    });
  }

});



