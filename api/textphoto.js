const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data");

async function maker(url, text) {
   if (!/https?:\/\/(ephoto360|photooxy|textpro)\.(com|me)/i.test(url)) {
      throw new Error("URL Invalid - Only ephoto360, photooxy, and textpro websites are supported");
   }
   
   try {
      // Step 1: Get initial page and extract form data
      let a = await axios.get(url, {
         headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188"
         },
         maxRedirects: 5,
         timeout: 30000
      });

      let $ = cheerio.load(a.data);

      let server = $('#build_server').val() || '';
      let serverId = $('#build_server_id').val() || '';
      let token = $('#token').val() || '';
      let submit = $('#submit').val() || 'Create';

      // Extract radio options
      let types = [];
      $('input[name="radio0[radio]"]').each((i, elem) => {
         types.push($(elem).attr("value"));
      });

      // Build form data
      let post = {
         'submit': submit,
         'token': token,
         'build_server': server,
         'build_server_id': Number(serverId) || 1
      };

      if (types.length !== 0) {
         post['radio0[radio]'] = types[Math.floor(Math.random() * types.length)];
      }

      // Handle text inputs properly
      let form = new FormData();
      for (let key in post) {
         form.append(key, post[key]);
      }
      
      if (typeof text === "string") text = [text];
      if (!Array.isArray(text)) text = [String(text)];
      
      // Some sites use text[] and some use text[0], text[1]
      for (let i = 0; i < text.length; i++) {
         form.append(`text[${i}]`, String(text[i]));
         form.append("text[]", String(text[i])); // fallback
      }

      // Extract cookies properly
      let cookies = '';
      if (a.headers['set-cookie']) {
         cookies = a.headers['set-cookie'].map(cookie => {
            return cookie.split(';')[0];
         }).join('; ');
      }

      // Step 2: Submit form
      let b = await axios.post(url, form, {
         headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Origin": new URL(url).origin,
            "Referer": url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188",
            "Cookie": cookies,
            ...form.getHeaders()
         },
         maxRedirects: 5,
         timeout: 30000
      });

      // Step 3: Extract form_value for create-image
      $ = cheerio.load(b.data);
      
      let out = '';
      let formValueElem = $('#form_value').first();
      let formValueInputElem = $('#form_value_input').first();
      
      out = formValueElem.text() || formValueInputElem.text() || formValueElem.val() || formValueInputElem.val() || '';

      if (!out || out.trim() === '') {
         throw new Error("Could not extract form_value from response. The effect may require different parameters.");
      }

      let parsedOut;
      try {
         parsedOut = JSON.parse(out);
      } catch (jsonErr) {
         throw new Error(`Failed to parse form_value: ${out.substring(0, 100)}`);
      }

      // Step 4: Create image
      let origin = new URL(url).origin;
      
      let c = await axios.post(origin + "/effect/create-image", parsedOut, {
         headers: {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json", // FIXED: was wrong content-type
            "X-Requested-With": "XMLHttpRequest",
            "Origin": origin,
            "Referer": url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188",
            "Cookie": cookies
         },
         timeout: 60000 // Longer timeout for image generation
      });

      // Handle response
      let responseData = c.data;
      
      if (typeof responseData === 'string') {
         try {
            responseData = JSON.parse(responseData);
         } catch (e) {
            // Keep as string
         }
      }

      let imageUrl = '';
      if (responseData?.fullsize_image) {
         imageUrl = server + responseData.fullsize_image;
      } else if (responseData?.image) {
         imageUrl = server + responseData.image;
      } else if (responseData?.imageUrl) {
         imageUrl = responseData.imageUrl;
      }

      return {
         status: responseData?.success || true,
         image: imageUrl,
         session: responseData?.session_id || null,
         raw: responseData
      };

   } catch (e) {
      if (e.response) {
         throw new Error(`HTTP ${e.response.status}: ${e.message}`);
      }
      throw e;
   }
}

module.exports = maker;
