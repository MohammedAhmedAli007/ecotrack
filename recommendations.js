(function () {
  "use strict";

  function chooseSuggestion(entry) {
    const category = String(entry.category || "").toLowerCase();
    const fuel = String(entry.fuelType || "").toLowerCase();
    const mode = String(entry.mode || "").toLowerCase();
    const material = String(entry.material || "").toLowerCase();
    const disposal = String(entry.disposal || "").toLowerCase();

    // TRANSPORT: recommendations depend on the travel mode.
    if (category === "transport") {
      const suggestions = {
        car: {
          title: "Reduce solo car journeys",
          action: "Combine errands into one trip or share the ride when practical. For short journeys, consider walking or cycling when the route is safe."
        },
        auto: {
          title: "Consider sharing your ride",
          action: "When practical, share a cab or auto for a similar journey, or compare with public transport options."
        },
        motorcycle: {
          title: "Plan more efficient journeys",
          action: "Combine nearby errands and avoid unnecessary separate trips. Keep the vehicle maintained according to its service schedule."
        },
        bus: {
          title: "Make public transport your regular choice",
          action: "Continue using the bus where practical. Check whether nearby errands can be completed on foot along a safe route."
        },
        metro: {
          title: "Continue using mass transit",
          action: "Use the metro or train for suitable journeys and consider walking or cycling for safe, short connections."
        },
        walk: {
          title: "Keep choosing active travel",
          action: "Continue walking for suitable short journeys. Choose a safe route and use other transport when distance or conditions require it."
        },
        cycle: {
          title: "Keep cycling when practical",
          action: "Consider cycling for suitable short journeys, using safe routes and appropriate safety equipment."
        }
      };

      return suggestions[mode] || {
        title: "Review your travel options",
        action: "Compare public transport, shared rides, and active travel for your next suitable journey."
      };
    }

    // FUEL: petrol and diesel have different messages.
    if (category === "fuel") {
      if (fuel === "petrol") {
        return {
          title: "Reduce petrol use on future trips",
          action: "Combine errands, avoid unnecessary engine idling, and consider public transport or a shared ride when practical."
        };
      }

      if (fuel === "diesel") {
        return {
          title: "Plan trips to reduce diesel use",
          action: "Combine destinations into fewer journeys and avoid unnecessary idling. Consider a shared ride or public transport when practical."
        };
      }

      return {
        title: "Avoid unnecessary fuel use",
        action: "Plan journeys ahead, combine errands, and compare lower-impact travel options where practical."
      };
    }

    // ELECTRICITY: use different suggestions for different records.
    if (category === "electricity") {
      const amount = Number(entry.amount) || 0;

      if (amount >= 100) {
        return {
          title: "Review your larger electricity use",
          action: "Check which appliances account for most of the usage. Use efficient settings and switch off equipment when it is not needed."
        };
      }

      return {
        title: "Reduce unnecessary electricity use",
        action: "Switch off unused lights and devices, avoid unnecessary standby power, and choose efficient settings when practical."
      };
    }

    // WASTE: use the material and disposal method.
    if (category === "waste") {
      if (disposal === "reused") {
        return {
          title: "Keep reusing materials",
          action: "Continue using the material where safe and practical, and avoid replacing it before necessary."
        };
      }

      if (disposal === "recycled") {
        return {
          title: "Improve recycling habits",
          action: "Separate the material according to local recycling rules and keep it clean if your local service requires that."
        };
      }

      if (material === "cardboard") {
        return {
          title: "Reuse cardboard before disposal",
          action: "Reuse suitable boxes for storage or packing, then recycle them through an accepted local service."
        };
      }

      if (material === "plastic") {
        return {
          title: "Reduce single-use plastic packaging",
          action: "Reuse suitable packaging where safe, avoid unnecessary packaging, and check local rules before recycling."
        };
      }

      return {
        title: "Sort waste before disposal",
        action: "Separate reusable and recyclable materials where local facilities accept them, and avoid unnecessary packaging."
      };
    }

    // Fallback for other activity types.
    const text = [
      entry.name,
      entry.product,
      entry.productName,
      entry.activity,
      entry.title,
      entry.description
    ].filter(Boolean).join(" ").toLowerCase();

    if (/bottle|cup/.test(text)) {
      return {
        title: "Reuse a bottle or cup",
        action: "Carry a reusable bottle or cup you already own instead of buying a single-use container."
      };
    }

    if (/phone|laptop|computer|charger|headphone|electronic|device/.test(text)) {
      return {
        title: "Extend electronics' useful life",
        action: "Repair, reuse, or borrow a suitable device or accessory before replacing it."
      };
    }

    if (/clothing|shirt|jeans|jacket|fashion/.test(text)) {
      return {
        title: "Make clothing last longer",
        action: "Repair, reuse, or borrow clothing where practical before buying something new."
      };
    }

    return {
      title: "Reuse before replacing",
      action: "Check whether an existing item can be reused, repaired, or borrowed before purchasing a replacement."
    };
  }

  window.EcoTrackRecommendations = {
    getRecommendations({ entries } = {}) {
      if (!Array.isArray(entries)) return [];

      return entries.map((entry, index) => {
        const safeEntry =
          entry && typeof entry === "object" ? entry : {};

        const suggestion = chooseSuggestion(safeEntry);

        return {
          entryId: safeEntry.id ?? `activity-${index + 1}`,
          title: suggestion.title,
          action: suggestion.action
        };
      });
    }
  };
})();