(function (window) {
  "use strict";

  var $ = window.jQuery;

  if (!$) {
    return;
  }

  function bindLogoFallback() {
    function useFallbackLogo(image) {
      var $image = $(image);
      var fallbackSource = $image.attr("data-fallback-src");

      if (fallbackSource && $image.attr("src") !== fallbackSource) {
        $image.attr("src", fallbackSource);
      }
    }

    $(".brand-logo").on("error", function () {
      useFallbackLogo(this);
    });

    $(".brand-logo").each(function () {
      var fallbackSource = $(this).attr("data-fallback-src");

      if (fallbackSource && this.complete && this.naturalWidth === 0) {
        useFallbackLogo(this);
      }
    });
  }

  function sanitizeText(value, maxLength) {
    var normalized = String(value || "")
      .replace(/[<>"'`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.slice(0, maxLength);
  }

  function sanitizeEmail(value) {
    var normalized = sanitizeText(value, 120).toLowerCase();
    var emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    return emailPattern.test(normalized) ? normalized : "";
  }

  function sanitizePhone(value) {
    var normalized = String(value || "").replace(/[^0-9+()\-\s]/g, "").trim();
    return normalized.slice(0, 24);
  }

  function getSelectedOptionValue($field) {
    var value = sanitizeText($field.val(), 80);

    if (value === "Select a Service" || value === "Select Type") {
      return "";
    }

    return value;
  }

  function buildQuotePayload($form) {
    return {
      website: sanitizeText($form.find("[name='website']").val(), 80),
      startedAt: $form.attr("data-started-at") || "",
      service: getSelectedOptionValue($form.find("[name='service']")),
      workType: getSelectedOptionValue($form.find("[name='workType']")),
      company: sanitizeText($form.find("[name='company']").val(), 80),
      name: sanitizeText($form.find("[name='name']").val(), 70),
      email: sanitizeEmail($form.find("[name='email']").val()),
      phone: sanitizePhone($form.find("[name='phone']").val()),
      city: sanitizeText($form.find("[name='city']").val(), 50),
      dateNeeded: sanitizeText($form.find("[name='dateNeeded']").val(), 40),
      notes: sanitizeText($form.find("[name='notes']").val(), 280)
    };
  }

  function setFormStatus($status, message, state) {
    $status
      .removeClass("is-error is-success")
      .addClass(state ? "is-" + state : "")
      .text(message);
  }

  function renderPreview($container, items) {
    $container.empty();

    $.each(items, function (_, item) {
      if (!item.value) {
        return;
      }

      $("<p />")
        .text(item.label + ": " + item.value)
        .appendTo($container);
    });

    $container.toggleClass("is-visible", $container.children().length > 0);
  }

  function bindFaq() {
    $(".faq-toggle").on("click", function () {
      var $button = $(this);
      var $answer = $button.closest(".faq-item").find(".faq-answer");
      var expanded = $button.attr("aria-expanded") === "true";

      $button.attr("aria-expanded", String(!expanded));
      $button.find(".faq-icon").text(expanded ? "+" : "-");
      $answer.stop(true, true).slideToggle(180);
    });
  }

  function bindMenus() {
    $(".mobile-menu-button").on("click", function () {
      var $button = $(this);
      var target = $button.attr("data-target");
      var $target = $(target);
      var expanded = $button.attr("aria-expanded") === "true";

      $button.attr("aria-expanded", String(!expanded));
      $target.toggleClass("is-open", !expanded);
    });

    $(".primary-navigation a").on("click", function () {
      $(".mobile-menu-button").attr("aria-expanded", "false");
      $(".primary-navigation").removeClass("is-open");
    });
  }

  function bindSmoothAnchors() {
    $("a[href^='#']").on("click", function (event) {
      var targetSelector = $(this).attr("href");
      var target = targetSelector.length > 1 ? document.querySelector(targetSelector) : null;

      if (!target) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindScrollReveal() {
    var revealTargets = document.querySelectorAll(".results-panel, .process-panel, .quote-panel, .faq-item, .detail-grid article, .detail-timeline article");

    if (!("IntersectionObserver" in window)) {
      $(revealTargets).addClass("is-visible");
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealTargets.forEach(function (target) {
      target.classList.add("reveal-on-scroll");
      observer.observe(target);
    });
  }

  function bindHeroSelector() {
    $(".hero-service-selector").on("submit", function (event) {
      event.preventDefault();
      document.querySelector("#quote-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function bindForms() {
    $(".secure-quote-form").attr("data-started-at", String(Date.now()));

    $(".secure-quote-form").on("submit", function (event) {
      event.preventDefault();

      var $form = $(this);
      var payload = buildQuotePayload($form);
      var $status = $form.find(".form-status");
      var $preview = $form.find(".quote-preview");
      var $button = $form.find("button[type='submit']");

      if (!payload.name || !payload.phone || !payload.email || !payload.city || !payload.service) {
        setFormStatus($status, "Please enter a name, phone, valid email, city, and service needed.", "error");
        $preview.removeClass("is-visible").empty();
        return;
      }

      renderPreview($preview, [
        { label: "Service", value: payload.service },
        { label: "Work Type", value: payload.workType },
        { label: "Contact", value: payload.name },
        { label: "Company", value: payload.company },
        { label: "Phone", value: payload.phone },
        { label: "Email", value: payload.email },
        { label: "Location", value: payload.city },
        { label: "Date Needed", value: payload.dateNeeded },
        { label: "Details", value: payload.notes }
      ]);

      setFormStatus($status, "Sending your secure quote request...", "");
      $button.prop("disabled", true);

      $.ajax({
        url: "/api/send-quote",
        method: "POST",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        data: JSON.stringify(payload),
        timeout: 12000
      }).done(function () {
        setFormStatus($status, "Quote request sent. Dispatch will review your details shortly.", "success");
        $form[0].reset();
        $form.attr("data-started-at", String(Date.now()));
      }).fail(function (xhr) {
        var responseMessage = xhr.responseJSON && xhr.responseJSON.message;
        var fallbackMessage = "We could not send the request securely. Please call +1 (587) 647-4000 or try again in a few minutes.";
        setFormStatus($status, responseMessage || fallbackMessage, "error");
      }).always(function () {
        $button.prop("disabled", false);
      });
    });
  }

  $(function () {
    $("body").addClass("is-loaded");
    bindLogoFallback();
    bindMenus();
    bindFaq();
    bindHeroSelector();
    bindForms();
    bindSmoothAnchors();
    bindScrollReveal();
  });
})(window);
