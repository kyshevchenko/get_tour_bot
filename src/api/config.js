const HTTP_METHOD = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "PATCH",
  DELETE: "delete",
};

const somethingWrongMsg = "Что-то пошло не так...";

export const getRequest = async (url) => {
  try {
    const response = await fetch(url);
    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Error in getRequest:", error);
    return { error: somethingWrongMsg };
  }
};

export const postRequest = async (url, payload) => {
  try {
    const response = await fetch(url, {
      method: HTTP_METHOD.POST,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Error in postRequest:", error);
    return { error: somethingWrongMsg };
  }
};

export const patchRequest = async (url, payload) => {
  try {
    const response = await fetch(url, {
      method: HTTP_METHOD.PATCH,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    console.error("Error in patchRequest:", error);
    return { error: somethingWrongMsg };
  }
};

export const deleteRequest = async (url, payload) => {
  try {
    const response = await fetch(url, {
      method: HTTP_METHOD.DELETE,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    console.error("Error in deleteRequest:", error);
    return { error: somethingWrongMsg };
  }
};
