import { useState, type FormEvent } from "react";
import pattern from "../assets/p01-04-hex-pattern.png";
import { PublicHeader } from "./PublicHeader";
import { Button } from "./Button";
import "./PublicRegisterOrganization.css";

const sample = {
  name: "사랑교회",
  detail: "서울 서초구 · 김성민 목사",
};

function showsSample(name: string) {
  const needle = name.trim().toLocaleLowerCase();
  if (needle === "") {
    return true;
  }
  const target = sample.name.toLocaleLowerCase();
  return target.includes(needle) || needle.includes(target);
}

export function PublicRegisterOrganization() {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [leader, setLeader] = useState("");
  const match = showsSample(name);
  const ready =
    name.trim() !== "" && region.trim() !== "" && phone.trim() !== "" && leader.trim() !== "";

  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <>
      <PublicHeader accountActions />
      <main className="public-register">
        <div className="public-register__pattern" aria-hidden="true">
          <img className="public-register__hex public-register__hex--1" src={pattern} alt="" />
          <img className="public-register__hex public-register__hex--2" src={pattern} alt="" />
          <img className="public-register__hex public-register__hex--3" src={pattern} alt="" />
          <img className="public-register__hex public-register__hex--4" src={pattern} alt="" />
        </div>
        <div className="public-register__content">
          <h1 className="public-register__title">새 교회·단체 등록</h1>
          <p className="public-register__support">조직을 만들면 이 계정이 첫 Owner가 돼요.</p>
          <form className="public-register__form" onSubmit={hold}>
            <div className="public-register__field">
              <label className="public-register__label" htmlFor="register-name">
                교회·단체명
              </label>
              <span className="public-register__control">
                <input
                  id="register-name"
                  type="text"
                  name="name"
                  autoComplete="organization"
                  placeholder="교회·단체명을 입력해 주세요"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </span>
            </div>
            <div className="public-register__pair">
              <div className="public-register__field">
                <label className="public-register__label" htmlFor="register-region">
                  지역
                </label>
                <span className="public-register__control">
                  <input
                    id="register-region"
                    type="text"
                    name="region"
                    autoComplete="address-level1"
                    placeholder="지역을 입력해 주세요"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  />
                </span>
              </div>
              <div className="public-register__field">
                <label className="public-register__label" htmlFor="register-phone">
                  대표 연락처
                </label>
                <span className="public-register__control">
                  <input
                    id="register-phone"
                    type="text"
                    name="phone"
                    autoComplete="tel"
                    placeholder="연락처를 입력해 주세요"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </span>
              </div>
            </div>
            <div className="public-register__field">
              <label className="public-register__label" htmlFor="register-leader">
                대표자 또는 담당 목회자 성명
              </label>
              <span className="public-register__control">
                <input
                  id="register-leader"
                  type="text"
                  name="leader"
                  autoComplete="name"
                  placeholder="성명을 입력해 주세요"
                  value={leader}
                  onChange={(event) => setLeader(event.target.value)}
                />
              </span>
            </div>
            {match ? (
              <div className="public-register__match">
                <p className="public-register__hint">이미 등록된 교회일 수 있어요</p>
                <div className="public-register__match-row">
                  <span className="public-register__match-name">{sample.name}</span>
                  <span className="public-register__match-detail">{sample.detail}</span>
                  <button className="public-register__ask" type="button">
                    가입 요청
                  </button>
                </div>
              </div>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              size={40}
              className="public-register__submit"
              disabled={!ready}
            >
              교회·단체 만들기
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
