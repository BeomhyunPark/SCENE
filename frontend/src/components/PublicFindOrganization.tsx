import { useState, type FormEvent } from "react";
import pattern from "../assets/p01-04-hex-pattern.png";
import search from "../assets/icon-search.svg";
import { PublicHeader } from "./PublicHeader";
import "./PublicFindOrganization.css";

const sample = {
  name: "드림공동체",
  region: "서울",
};

function matches(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return true;
  }
  return (
    sample.name.toLocaleLowerCase().includes(needle) ||
    sample.region.toLocaleLowerCase().includes(needle)
  );
}

export function PublicFindOrganization() {
  const [query, setQuery] = useState("");
  const visible = matches(query);

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <>
      <PublicHeader accountActions primaryStart />
      <main className="public-find">
        <div className="public-find__pattern" aria-hidden="true">
          <img className="public-find__hex public-find__hex--1" src={pattern} alt="" />
          <img className="public-find__hex public-find__hex--2" src={pattern} alt="" />
          <img className="public-find__hex public-find__hex--3" src={pattern} alt="" />
          <img className="public-find__hex public-find__hex--4" src={pattern} alt="" />
        </div>
        <div className="public-find__content">
          <h1 className="public-find__title">소속 교회나 단체를 찾아주세요</h1>
          <p className="public-find__support">가입할 교회·단체를 검색하고 요청을 보낼 수 있어요.</p>
          <form className="public-find__search" onSubmit={hold}>
            <div className="public-find__field">
              <label className="public-find__label" htmlFor="find-organization">
                교회·단체 검색
              </label>
              <span className="public-find__control">
                <img src={search} alt="" width={20} height={20} aria-hidden="true" />
                <input
                  id="find-organization"
                  type="text"
                  name="query"
                  autoComplete="off"
                  placeholder="이름 또는 지역을 입력해 주세요"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </div>
            <p className="public-find__results">검색 결과</p>
            {visible ? (
              <button className="public-find__result" type="button">
                <span className="public-find__org">
                  <span className="public-find__name">{sample.name}</span>
                  <span className="public-find__region">{sample.region}</span>
                </span>
                <span className="public-find__ask">가입 요청</span>
              </button>
            ) : null}
            <p className="public-find__missing">
              찾는 교회·단체가 없나요?
              <button className="public-find__register" type="button">
                새로 등록하기
              </button>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
